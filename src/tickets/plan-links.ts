import { Fs } from '@fs';
import { parseFrontmatter } from '@md';
import { Path } from '@path';
import { basename, dirname, isAbsolute, join, relative, resolve, SEPARATOR } from '@std/path';
import { parse, postprocess, preprocess } from 'micromark';
import { decodeString } from 'micromark-util-decode-string';

import { stringifyMessages } from '../log/helpers/stringifyMessages.ts';
import { withOperationLock } from './with-ticket-lock.ts';

export type TicketLinkTarget = { id: string; slug: string; path: string };

export type TicketLinkFinding = {
    path: string;
    destination: string;
    expectedDestination: string;
};

export type LinkWarning = { path: string; message: string };

export type TicketLinkScan = {
    files: string[];
    findings: TicketLinkFinding[];
    warnings: LinkWarning[];
};

type LinkEdit = {
    start: number;
    end: number;
    destination: string;
    expectedDestination: string;
};

export async function scanTicketLinks(
    projectRoot: string,
    target: TicketLinkTarget,
    signal: AbortSignal,
): Promise<TicketLinkScan> {
    signal.throwIfAborted();
    const scan: TicketLinkScan = { files: [], findings: [], warnings: [] };
    const root = await Deno.realPath(resolve(projectRoot));
    const plans = join(root, Path.CODERAIL_DIR, Path.PLANS_DIR);
    let directory: string;
    try {
        directory = await planDirectory(plans);
    } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof Deno.errors.NotFound)) {
            scan.warnings.push(warning(plans, 'Cannot inspect plan links', error));
        }
        return scan;
    }

    const destination = canonicalTarget(projectRoot, root, target);
    for await (const path of planFiles(directory, scan.warnings, signal)) {
        try {
            const doc = await planFile(directory, path);
            const content = await readMarkdown(doc);
            const edits = ticketLinkEdits(content, doc, root, destination);
            if (edits.length > 0) {
                scan.files.push(doc);
            }
            for (const { destination, expectedDestination } of edits) {
                if (destination !== expectedDestination) {
                    scan.findings.push({ path: doc, destination, expectedDestination });
                }
            }
        } catch (error) {
            scan.warnings.push(warning(path, 'Cannot inspect plan links', error));
        }
    }
    signal.throwIfAborted();
    return scan;
}

export async function updateTicketLinks(
    projectRoot: string,
    target: TicketLinkTarget,
    scan: TicketLinkScan,
    signal: AbortSignal,
): Promise<LinkWarning[]> {
    if (scan.files.length === 0) {
        return [];
    }
    const root = await Deno.realPath(resolve(projectRoot));
    const plans = join(root, Path.CODERAIL_DIR, Path.PLANS_DIR);
    const destination = canonicalTarget(projectRoot, root, target);
    const warnings: LinkWarning[] = [];
    for (const [index, path] of scan.files.entries()) {
        try {
            signal.throwIfAborted();
            const directory = await planDirectory(plans);
            const doc = await planFile(directory, path);
            const key = relative(root, doc).split(SEPARATOR).join('/');
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
            const lock = join(
                root,
                Path.CODERAIL_DIR,
                '.locks',
                'markdown',
                `${new Uint8Array(digest).toHex()}.lock`,
            );
            await withOperationLock(lock, `plan document ${doc}`, signal, async () => {
                const content = await readMarkdown(await planFile(await planDirectory(plans), doc));
                signal.throwIfAborted();
                const edits = ticketLinkEdits(content, doc, root, destination);
                const updated = applyEdits(content, edits);
                if (updated !== content) {
                    await Fs.write(doc, ReadableStream.from([updated]));
                }
            });
        } catch (error) {
            if (signal.aborted) {
                for (const pending of scan.files.slice(index)) {
                    warnings.push(
                        warning(pending, 'Plan link maintenance interrupted', signal.reason),
                    );
                }
                break;
            }
            warnings.push(warning(path, 'Cannot update plan links', error));
        }
    }
    return warnings;
}

async function* planFiles(
    directory: string,
    warnings: LinkWarning[],
    signal: AbortSignal,
): AsyncGenerator<string> {
    try {
        for await (const entry of Deno.readDir(directory)) {
            signal.throwIfAborted();
            const path = join(directory, entry.name);
            if (entry.isDirectory) {
                yield* planFiles(path, warnings, signal);
            } else if (entry.isFile && /\.md$/i.test(entry.name)) {
                yield path;
            }
        }
    } catch (error) {
        signal.throwIfAborted();
        warnings.push(warning(directory, 'Cannot inspect plan links', error));
    }
}

async function planDirectory(path: string): Promise<string> {
    if ((await Deno.lstat(path)).isSymlink || (await Deno.lstat(dirname(path))).isSymlink) {
        throw new Error('Plan directory resolves outside its project path');
    }
    return Deno.realPath(path);
}

async function planFile(plans: string, path: string): Promise<string> {
    if (!(await Deno.lstat(path)).isFile) {
        throw new Error('Expected a regular Markdown file inside the plan directory');
    }
    const doc = await Deno.realPath(path);
    if (!isDescendant(plans, doc)) {
        throw new Error('Expected a regular Markdown file inside the plan directory');
    }
    return doc;
}

async function readMarkdown(path: string): Promise<string> {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await Deno.readFile(path),
    );
}

function ticketLinkEdits(
    content: string,
    doc: string,
    root: string,
    target: TicketLinkTarget,
): LinkEdit[] {
    const bodyStart = markdownBodyStart(content);
    const body = content.slice(bodyStart);
    // The tokenizer excludes a UTF-8 BOM from its offsets.
    const offset = bodyStart + Number(body.startsWith('\uFEFF'));
    const events = postprocess(
        parse()
            .document()
            .write(preprocess()(body, undefined, true)),
    );
    const tickets = join(root, Path.CODERAIL_DIR, Path.TICKETS_DIR);
    const filename = `${target.id}-${target.slug}.md`;
    const targetPath = target.path;
    const expected = relative(dirname(doc), targetPath)
        .split(SEPARATOR)
        .map((part) => encodeURIComponent(part).replaceAll('(', '%28').replaceAll(')', '%29'))
        .join('/');
    const edits: LinkEdit[] = [];
    let images = 0;
    for (const [phase, token] of events) {
        if (token.type === 'image') {
            images += phase === 'enter' ? 1 : -1;
        }
        if (
            phase !== 'enter' ||
            images > 0 ||
            (token.type !== 'resourceDestinationString' &&
                token.type !== 'definitionDestinationString')
        ) {
            continue;
        }
        const start = token.start.offset + offset;
        const end = token.end.offset + offset;
        const destination = content.slice(start, end);
        const suffix = destinationSuffix(destination);
        const path = localPath(destination.slice(0, suffix), doc);
        if (path === undefined || basename(path) !== filename || !isDescendant(tickets, path)) {
            continue;
        }
        edits.push({
            start,
            end,
            destination,
            expectedDestination:
                path === targetPath ? destination : expected + destination.slice(suffix),
        });
    }
    return edits;
}

function markdownBodyStart(content: string): number {
    const header = /^(?:\uFEFF)?---\r?\n((?:[^\n]*\n)*?)---(?:\r?\n|$)/.exec(content);
    if (header === null) {
        return 0;
    }
    try {
        parseFrontmatter(header[1] as string);
        return header[0].length;
    } catch {
        return 0;
    }
}

function destinationSuffix(destination: string): number {
    const parts = destination.matchAll(
        /\\[\p{P}\p{S}]|&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][\da-zA-Z]*);|[?#]/gu,
    );
    for (const part of parts) {
        if (['#', '?'].includes(decodeString(part[0]))) {
            return part.index;
        }
    }
    return destination.length;
}

function localPath(destination: string, doc: string): string | undefined {
    const path = decodeString(destination);
    if (/^(?:[a-z][a-z\d+.-]*:|[/\\]{2})/i.test(path)) {
        return undefined;
    }
    try {
        return resolve(dirname(doc), decodeURIComponent(path));
    } catch {
        return undefined;
    }
}

function isDescendant(directory: string, path: string): boolean {
    const difference = relative(directory, path);
    return (
        difference !== '' &&
        difference !== '..' &&
        !difference.startsWith(`..${SEPARATOR}`) &&
        !isAbsolute(difference)
    );
}

function canonicalTarget(
    projectRoot: string,
    root: string,
    target: TicketLinkTarget,
): TicketLinkTarget {
    const path = resolve(projectRoot, target.path);
    if (isDescendant(join(root, Path.CODERAIL_DIR, Path.TICKETS_DIR), path)) {
        return { ...target, path };
    }
    return { ...target, path: resolve(root, relative(resolve(projectRoot), path)) };
}

function applyEdits(content: string, edits: LinkEdit[]): string {
    const chunks: string[] = [];
    let cursor = 0;
    for (const { start, end, expectedDestination } of edits) {
        chunks.push(content.slice(cursor, start), expectedDestination);
        cursor = end;
    }
    chunks.push(content.slice(cursor));
    return chunks.join('');
}

function warning(path: string, message: string, error: unknown): LinkWarning {
    return { path, message: stringifyMessages([message, error]) };
}
