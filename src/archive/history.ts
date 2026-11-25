import { type Frontmatter, Md } from '@md';

import { IdeaFrontmatter } from '../commands/idea/helpers/idea-frontmatter.ts';
import { ticketFilenamePattern } from '../tickets/inventory.ts';

export const ARCHIVE_REF = 'refs/heads/coderail/archive-history';
const batchPattern = /^(\d{4}-\d{2}-\d{2})_([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type ArchiveTreeEntry = { path: string; type: string; oid: string };

type ArchivedPlan = {
    title: string;
    path: string;
    parent: string | null;
    artifacts: string[];
};

type ArchivedTicket = { id: string; title: string; path: string };

async function git(
    root: string,
    signal: AbortSignal,
    ...args: string[]
): Promise<Uint8Array<ArrayBuffer>> {
    signal.throwIfAborted();
    const result = await new Deno.Command('git', {
        cwd: root,
        args,
        env: { GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' },
        signal,
        stdin: 'null',
    }).output();
    // for-each-ref reports broken refs on stderr even when it exits successfully.
    if (!result.success || result.stderr.length > 0) {
        throw new Error(`Git ${args[0]} failed: ${decoder.decode(result.stderr).trim()}`);
    }
    return result.stdout;
}

export async function getArchiveTip(
    root: string,
    signal: AbortSignal,
): Promise<string | undefined> {
    const output = await git(
        root,
        signal,
        'for-each-ref',
        '--format=%(objectname) %(refname)',
        ARCHIVE_REF,
    );
    for (const row of decoder.decode(output).trimEnd().split('\n')) {
        const [oid, ref] = row.split(' ');
        if (ref === ARCHIVE_REF) {
            return oid;
        }
    }
    return undefined;
}

export async function readArchiveTree(
    root: string,
    tree: string,
    signal: AbortSignal,
    recursive = false,
): Promise<ArchiveTreeEntry[]> {
    const output = await git(
        root,
        signal,
        'ls-tree',
        '--full-tree',
        recursive ? '-rtz' : '-z',
        tree,
        '--',
    );
    return decoder
        .decode(output)
        .split('\0')
        .filter(Boolean)
        .map((row) => {
            const separator = row.indexOf('\t');
            const [, type, oid] = row.slice(0, separator).split(' ') as [string, string, string];
            return { path: row.slice(separator + 1), type, oid };
        });
}

export async function listArchiveBatches(root: string, signal: AbortSignal): Promise<string[]> {
    const tip = await getArchiveTip(root, signal);
    if (tip === undefined) {
        return [];
    }
    const batches = await readArchiveTree(root, tip, signal);
    return batches
        .flatMap(({ path, type }) => {
            const match = batchPattern.exec(path);
            return type === 'tree' && match !== null
                ? [{ id: path, date: match[1] as string, name: match[2] as string }]
                : [];
        })
        .sort((a, b) => b.date.localeCompare(a.date, 'en') || a.name.localeCompare(b.name, 'en'))
        .map(({ id }) => id);
}

async function readBatchTree(
    root: string,
    batch: string,
    signal: AbortSignal,
): Promise<ArchiveTreeEntry[]> {
    const tip = await getArchiveTip(root, signal);
    const batches = tip === undefined ? [] : await readArchiveTree(root, tip, signal);
    const entry = batches.find(({ path, type }) => path === batch && type === 'tree');
    if (!batchPattern.test(batch) || entry === undefined) {
        throw new Error(`Unknown archive batch "${batch}".`);
    }
    return await readArchiveTree(root, entry.oid, signal, true);
}

function readBlob(
    root: string,
    oid: string,
    signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
    return git(root, signal, 'cat-file', 'blob', oid);
}

async function readFrontmatter(
    root: string,
    entry: ArchiveTreeEntry,
    signal: AbortSignal,
): Promise<Frontmatter> {
    const bytes = await readBlob(root, entry.oid, signal);
    const markdown = await Md.parse(
        new Blob([bytes]).stream().pipeThrough(new TextDecoderStream()),
    );
    await markdown.content.cancel();
    return markdown.frontmatter;
}

export async function listArchivedPlans(
    root: string,
    batch: string,
    signal: AbortSignal,
): Promise<ArchivedPlan[]> {
    const entries = await readBatchTree(root, batch, signal);
    const plans = new Map<string, ArchivedPlan>();
    const ideaEntries = entries
        .filter(({ path, type }) => type === 'blob' && /^plans\/.+\/IDEA\.md$/s.test(path))
        .map((entry) => ({ entry, directory: entry.path.slice(0, -'/IDEA.md'.length) }))
        .sort((a, b) => a.directory.localeCompare(b.directory));
    for (const { entry, directory } of ideaEntries) {
        const parentDirectory = directory.slice(0, directory.lastIndexOf('/'));
        const parent = plans.get(parentDirectory);
        if (parentDirectory !== 'plans' && parent === undefined) {
            continue;
        }
        const path = `${batch}/${entry.path}`;
        const frontmatter = await readFrontmatter(root, entry, signal);
        if (!IdeaFrontmatter.isIdeaFrontmatter(frontmatter)) {
            throw new Error(`Invalid archived idea title or status: ${path}`);
        }
        plans.set(directory, {
            title: frontmatter.title,
            path,
            parent: parent?.path ?? null,
            artifacts: [],
        });
    }

    const owner = (path: string): ArchivedPlan | undefined => {
        let slash = path.lastIndexOf('/');
        while (slash !== -1) {
            const directory = path.slice(0, slash);
            const plan = plans.get(directory);
            if (plan !== undefined) {
                return plan;
            }
            slash = directory.lastIndexOf('/');
        }
        return undefined;
    };
    for (const { path, type } of entries) {
        if (type !== 'blob') {
            continue;
        }
        const plan = owner(path);
        const fullPath = `${batch}/${path}`;
        if (plan !== undefined && plan.path !== fullPath) {
            plan.artifacts.push(fullPath);
        }
    }
    return [...plans.values()];
}

export async function listArchivedTickets(
    root: string,
    batch: string,
    signal: AbortSignal,
): Promise<ArchivedTicket[]> {
    const entries = await readBatchTree(root, batch, signal);
    const tickets: ArchivedTicket[] = [];
    for (const entry of entries) {
        const [directory, filename, subpath] = entry.path.split('/');
        if (
            entry.type !== 'blob' ||
            directory !== 'tickets' ||
            filename === undefined ||
            subpath !== undefined
        ) {
            continue;
        }
        const id = ticketFilenamePattern.exec(filename)?.[1];
        if (id === undefined) {
            continue;
        }
        const path = `${batch}/${entry.path}`;
        const { title } = await readFrontmatter(root, entry, signal);
        if (typeof title !== 'string' || title.trim() === '') {
            throw new Error(`Invalid archived ticket title: ${path}`);
        }
        tickets.push({ id, title, path });
    }
    return tickets.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export async function readArchivedFile(
    root: string,
    requested: string,
    signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
    const trailingSlash = requested.endsWith('/');
    const components = (trailingSlash ? requested.slice(0, -1) : requested).split('/');
    if (
        components.some(
            (part) => part === '' || part === '.' || part === '..' || part.includes('\0'),
        )
    ) {
        throw new Error(`Archive path "${requested}" must stay within one batch.`);
    }
    const [batch, ...segments] = components as [string, ...string[]];
    const entries = await readBatchTree(root, batch, signal);
    const path = segments.join('/');
    const entry = entries.find((entry) => entry.path === path);
    if (path === '' || entry?.type === 'tree') {
        throw new Error(`Archive path "${requested}" is a directory.`);
    }
    if (trailingSlash || entry?.type !== 'blob') {
        throw new Error(`Archived file "${requested}" was not found.`);
    }
    return await readBlob(root, entry.oid, signal);
}
