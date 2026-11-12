import { Log } from '@log';
import { parseFrontmatter } from '@md';
import { basename, dirname, join, resolve } from '@std/path';

import { createDoctorReport, type DoctorReport } from './types.ts';

/** Only these instruction formats have Markdown frontmatter. References remain opaque. */
export function instructionName(path: string): string | undefined {
    const skill = /^(?:instructions\/|\.codex\/)?skills\/([^/]+)\/SKILL\.md$/.exec(path);
    if (skill) {
        return skill[1];
    }
    const agent = /^(?:instructions\/|\.codex\/)?agents\/([^/]+)\.md$/.exec(path);
    return agent?.[1];
}

async function readInstruction(path: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    let current = resolve(path);
    while (true) {
        const info = await Deno.lstat(current);
        signal.throwIfAborted();
        if (current === resolve(path) ? !info.isFile : !info.isDirectory) {
            throw new Error('Instruction path must contain directories and a regular file');
        }
        const parent = dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await Deno.readFile(path, { signal }),
    );
}

/** Compute a surgical edit; never serialize the customized document or its metadata. */
function diagnose(original: string, expectedName: string): string | undefined {
    const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
    const text = original.slice(bom.length);
    const opener = /^---\r?\n/.exec(text);
    const start = opener?.[0].length ?? 0;
    const remaining = text.slice(start);
    const closer = /(?<=^|\n)---(?:\r?\n|(?![\s\S]))/.exec(remaining);
    if (!closer) {
        throw new Error('Missing frontmatter closing delimiter');
    }
    const metadata = remaining.slice(0, closer.index);
    const attributes = parseFrontmatter(metadata);
    if (typeof attributes.description !== 'string' || !attributes.description.trim()) {
        throw new Error('Frontmatter requires a nonblank string description');
    }
    const wrongName =
        typeof attributes.name !== 'string' ||
        attributes.name !== expectedName ||
        !attributes.name.trim();
    if (opener && !wrongName) {
        return undefined;
    }
    const eol = /^[^\n]*\r\n/.test(text) ? '\r\n' : '\n';
    let edited = metadata;
    if (wrongName) {
        let found = false;
        let inName = false;
        edited = metadata
            .split(/(?<=\n)/)
            .flatMap((line) => {
                const property =
                    /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_-]*):/.exec(line);
                if (property && parseFrontmatter(`${property[1]}: true`).name === true) {
                    found = true;
                    inName = true;
                    const ending = line.endsWith('\r\n') ? '\r\n' : '\n';
                    return [`name: ${JSON.stringify(expectedName)}${ending}`];
                }
                if (inName && /^ +-/.test(line)) {
                    return [];
                }
                if (line.trim()) {
                    inName = false;
                }
                return [line];
            })
            .join('');
        if (!found) {
            edited = `name: ${JSON.stringify(expectedName)}${eol}${edited}`;
        }
    }
    return `${bom}${opener?.[0] ?? `---${eol}`}${edited}${remaining.slice(closer.index)}`;
}

async function checkFile(
    path: string,
    expectedName: string,
    signal: AbortSignal,
): Promise<DoctorReport> {
    const report = createDoctorReport();
    signal.throwIfAborted();
    Log.notice(`Checking instruction frontmatter "${path}".`);
    try {
        const original = await readInstruction(path, signal);
        const edited = diagnose(original, expectedName);
        signal.throwIfAborted();
        if (edited !== undefined) {
            report.failures.push({
                message: `Instruction "${path}": expected name "${expectedName}" and opening frontmatter delimiter`,
                repairable: true,
                repair: {
                    key: `instruction:${resolve(path)}`,
                    description: `Repair instruction frontmatter "${path}"`,
                    async apply(actionSignal: AbortSignal): Promise<void> {
                        const current = await readInstruction(path, actionSignal);
                        if (current !== original) {
                            throw new Error(`Collected input changed at "${path}"`);
                        }
                        actionSignal.throwIfAborted();
                        await Deno.writeTextFile(path, edited, { signal: actionSignal });
                    },
                },
                manualRepair: [
                    `Set frontmatter name to "${expectedName}" and restore its opening delimiter in "${path}".`,
                ],
            });
        }
    } catch (error) {
        signal.throwIfAborted();
        report.failures.push({
            message: `Instruction "${path}": ${String(error)}`,
            repairable: false,
            manualRepair: [
                `Restore readable Markdown frontmatter with name "${expectedName}", a nonblank description and both delimiters in "${path}".`,
            ],
        });
    }
    return report;
}

async function checkAssets(resourceRoot: string, signal: AbortSignal): Promise<DoctorReport> {
    const report = createDoctorReport();
    for (const kind of ['skills', 'agents']) {
        const directory = join(resourceRoot, 'instructions', kind);
        signal.throwIfAborted();
        Log.notice(`Discovering instruction assets "${directory}".`);
        try {
            for await (const entry of Deno.readDir(directory)) {
                signal.throwIfAborted();
                const path = join(directory, entry.name);
                if (kind === 'skills' ? entry.isDirectory : entry.name.endsWith('.md')) {
                    const result = await checkFile(
                        kind === 'skills' ? join(path, 'SKILL.md') : path,
                        kind === 'skills' ? entry.name : basename(path, '.md'),
                        signal,
                    );
                    report.failures.push(...result.failures);
                }
            }
        } catch (error) {
            signal.throwIfAborted();
            if (!(error instanceof Deno.errors.NotFound)) {
                report.failures.push({
                    message: `Instruction assets "${directory}": ${String(error)}`,
                    repairable: false,
                    manualRepair: [`Restore readable instruction assets at "${directory}".`],
                });
            }
        }
    }
    return report;
}

export const Instructions = { checkAssets, checkFile };
