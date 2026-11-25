import { Path } from '@path';
import { dirname, join, SEPARATOR } from '@std/path';

import {
    applyLinkEdits,
    markdownLinkDestinations,
    planTicketDestination,
} from '../tickets/plan-links.ts';
import { ARCHIVE_REF, getArchiveTip } from './history.ts';
import { type ArchiveSelection, selectArchive } from './selection.ts';

type ApplyResult =
    | { status: 'empty' | 'declined'; sourceCommit: string }
    | {
          status: 'applied';
          batchId: string;
          sourceCommit: string;
          archiveCommit: string;
          paths: string[];
      };

type TreeEntry = { mode: string; type: string; oid: string; path: string };
type SourceFile = TreeEntry & { archivePath: string };
type Tree = { entries: TreeEntry[]; directories: Map<string, Tree> };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
const plansDirectory = `${Path.CODERAIL_DIR}/${Path.PLANS_DIR}`;
const closedDirectory = `${Path.CODERAIL_DIR}/${Path.TICKETS_DIR}/closed`;

async function git(
    root: string,
    signal: AbortSignal,
    args: string[],
    input?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
    signal.throwIfAborted();
    const command = new Deno.Command('git', {
        cwd: root,
        args,
        env: { GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' },
        signal,
        stdin: input === undefined ? 'null' : 'piped',
        stdout: 'piped',
        stderr: 'piped',
    });
    let output: Deno.CommandOutput;
    if (input === undefined) {
        output = await command.output();
    } else {
        const child = command.spawn();
        [output] = await Promise.all([
            child.output(),
            new Blob([input]).stream().pipeTo(child.stdin),
        ]);
    }
    if (!output.success) {
        throw new Error(`Git ${args[0]} failed: ${decoder.decode(output.stderr).trim()}`);
    }
    return output.stdout;
}

async function treeEntries(
    root: string,
    commit: string,
    signal: AbortSignal,
    ...paths: string[]
): Promise<TreeEntry[]> {
    const args =
        paths.length > 0 ? ['-r', '-z', commit, '--', ...paths] : ['--full-tree', '-z', commit];
    return decoder
        .decode(await git(root, signal, ['ls-tree', ...args]))
        .split('\0')
        .filter(Boolean)
        .map((record) => {
            const separator = record.indexOf('\t');
            const [mode, type, oid] = record.slice(0, separator).split(' ') as [
                string,
                string,
                string,
            ];
            return { mode, type, oid, path: record.slice(separator + 1) };
        });
}

function treeLine({ mode, type, oid, path }: TreeEntry): string {
    return `${mode} ${type} ${oid}\t${path}\0`;
}

async function writeTree(root: string, entries: TreeEntry[], signal: AbortSignal): Promise<string> {
    return decoder
        .decode(
            await git(
                root,
                signal,
                ['mktree', '-z'],
                encoder.encode(entries.map(treeLine).join('')),
            ),
        )
        .trim();
}

async function writeBlob(root: string, content: string, signal: AbortSignal): Promise<string> {
    return decoder
        .decode(await git(root, signal, ['hash-object', '-w', '--stdin'], encoder.encode(content)))
        .trim();
}

async function commitTree(
    root: string,
    tree: string,
    parent: string | undefined,
    message: string,
    signal: AbortSignal,
): Promise<string> {
    const parents = parent === undefined ? [] : ['-p', parent];
    return decoder
        .decode(
            await git(root, signal, [
                'commit-tree',
                '--no-gpg-sign',
                tree,
                ...parents,
                '-m',
                message,
            ]),
        )
        .trim();
}

function archivePath(path: string): string {
    return path.startsWith(closedDirectory + '/')
        ? `tickets/${path.slice(closedDirectory.length + 1)}`
        : path.slice(Path.CODERAIL_DIR.length + 1);
}

async function ensureArchiveIsNotCheckedOut(root: string, signal: AbortSignal): Promise<void> {
    const worktrees = decoder.decode(
        await git(root, signal, ['worktree', 'list', '--porcelain', '-z']),
    );
    if (worktrees.split('\0').includes(`branch ${ARCHIVE_REF}`)) {
        throw new Error(
            'The archive branch is checked out in a worktree. Switch away before applying.',
        );
    }
}

function newTree(): Tree {
    return { entries: [], directories: new Map() };
}

function addBlob(tree: Tree, path: string, mode: string, oid: string): void {
    const parts = path.split('/');
    const name = parts.pop() as string;
    for (const part of parts) {
        let child = tree.directories.get(part);
        if (child === undefined) {
            child = newTree();
            tree.directories.set(part, child);
        }
        tree = child;
    }
    tree.entries.push({ mode, type: 'blob', oid, path: name });
}

async function writeBatchTree(root: string, tree: Tree, signal: AbortSignal): Promise<string> {
    for (const [path, child] of tree.directories) {
        tree.entries.push({
            mode: '040000',
            type: 'tree',
            oid: await writeBatchTree(root, child, signal),
            path,
        });
    }
    return await writeTree(root, tree.entries, signal);
}

function readme(
    batchId: string,
    description: string,
    selection: ArchiveSelection,
    files: SourceFile[],
): string {
    const link = (path: string): string =>
        `- [${path.replace(/[\\[\]]/g, '\\$&')}](${planTicketDestination('README.md', path, '')})`;
    const plans = selection.eligible.flatMap(({ plans }) => plans);
    const tickets = selection.eligible.flatMap(({ plans, tickets }) =>
        plans.length === 0 ? tickets : [],
    );
    return [
        `# ${batchId}`,
        '',
        description,
        '',
        ...(plans.length === 0
            ? []
            : ['## Plans', '', ...plans.map((path) => link(`${archivePath(path)}/IDEA.md`)), '']),
        ...(tickets.length === 0
            ? []
            : ['## Standalone tickets', '', ...tickets.map((path) => link(archivePath(path))), '']),
        '## Provenance',
        '',
        `Source revision: ${selection.sourceCommit}`,
        '',
        ...files.map(({ path }) => `- ${JSON.stringify(path)}`),
        '',
    ].join('\n');
}

function remapMarkdown(
    root: string,
    file: SourceFile,
    content: string,
    destinations: Map<string, { path: string; isDirectory: boolean }>,
): string {
    const edits = [];
    for (const link of markdownLinkDestinations(
        content,
        join(root, file.path),
        [join(root, plansDirectory), join(root, closedDirectory)],
        true,
    )) {
        const mapped = destinations.get(link.path);
        if (mapped === undefined) {
            continue;
        }
        const destination = planTicketDestination(file.archivePath, mapped.path, '');
        const path = mapped.isDirectory ? `${destination || '.'}/` : destination;
        edits.push({ ...link, expectedDestination: path + link.destination.slice(link.suffix) });
    }
    return applyLinkEdits(content, edits);
}

async function sourceBlob(
    root: string,
    file: SourceFile,
    signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
    return await git(root, signal, ['cat-file', 'blob', file.oid]);
}

async function recordBatch(
    root: string,
    batchId: string,
    description: string,
    selection: ArchiveSelection,
    signal: AbortSignal,
): Promise<{
    previous: string | undefined;
    archiveCommit: string;
    batchTree: string;
    files: SourceFile[];
}> {
    const previous = await getArchiveTip(root, signal);
    const entries = previous === undefined ? [] : await treeEntries(root, previous, signal);
    if (entries.some(({ path }) => path === batchId)) {
        throw new Error(`Archive batch "${batchId}" already exists.`);
    }
    const paths = selection.eligible.flatMap((group) => group.paths).sort();
    const committed = await treeEntries(root, selection.sourceCommit, signal, Path.CODERAIL_DIR);
    const byPath = new Map(committed.map((entry) => [entry.path, entry]));
    const files: SourceFile[] = paths.map((path) => {
        const file = byPath.get(path);
        if (file === undefined) {
            throw new Error(
                `Cannot read archive source file "${path}" from ${selection.sourceCommit}.`,
            );
        }
        return { ...file, archivePath: archivePath(path) };
    });
    const destinations = new Map<string, { path: string; isDirectory: boolean }>();
    for (const file of files) {
        destinations.set(join(root, file.path), { path: file.archivePath, isDirectory: false });
        let parent = dirname(file.path).split(SEPARATOR).join('/');
        while (parent.startsWith(plansDirectory + '/')) {
            destinations.set(join(root, parent), { path: archivePath(parent), isDirectory: true });
            parent = dirname(parent).split(SEPARATOR).join('/');
        }
    }
    const batch = newTree();
    for (const file of files) {
        let oid = file.oid;
        if (/\.md$/i.test(file.path)) {
            const original = decoder.decode(await sourceBlob(root, file, signal));
            const updated = remapMarkdown(root, file, original, destinations);
            if (updated !== original) {
                oid = await writeBlob(root, updated, signal);
            }
        }
        addBlob(batch, file.archivePath, file.mode, oid);
    }
    addBlob(
        batch,
        'README.md',
        '100644',
        await writeBlob(root, readme(batchId, description, selection, files), signal),
    );
    const batchTree = await writeBatchTree(root, batch, signal);
    const tree = await writeTree(
        root,
        [...entries, { mode: '040000', type: 'tree', oid: batchTree, path: batchId }],
        signal,
    );
    const archiveCommit = await commitTree(root, tree, previous, `Archive ${batchId}`, signal);
    await ensureArchiveIsNotCheckedOut(root, signal);
    signal.throwIfAborted();
    // Avoid interrupting Git between publishing the ref and reporting success.
    await git(root, new AbortController().signal, [
        'update-ref',
        '--no-deref',
        ARCHIVE_REF,
        archiveCommit,
        previous ?? '0'.repeat(archiveCommit.length),
    ]);
    return { previous, archiveCommit, batchTree, files };
}

async function assertSourceMatches(
    root: string,
    file: SourceFile,
    content: Uint8Array,
    signal: AbortSignal,
): Promise<void> {
    const path = join(root, file.path);
    const info = await Deno.lstat(path);
    const mode = info.mode === null ? file.mode : info.mode & 0o100 ? '100755' : '100644';
    if (!info.isFile || mode !== file.mode || (await Deno.realPath(path)) !== path) {
        throw new Error(`Archive source file changed: "${file.path}".`);
    }
    const current = await Deno.readFile(path, { signal });
    if (
        content.length !== current.length ||
        !content.every((byte, index) => byte === current[index])
    ) {
        throw new Error(`Archive source file changed: "${file.path}".`);
    }
}

async function assertSourceIndexMatches(
    root: string,
    file: SourceFile,
    signal: AbortSignal,
): Promise<void> {
    const output = await git(root, signal, [
        'ls-files',
        '--stage',
        '-z',
        '--',
        `:(literal)${file.path}`,
    ]);
    if (decoder.decode(output) !== `${file.mode} ${file.oid} 0\t${file.path}\0`) {
        throw new Error(`Archive source file changed in the index: "${file.path}".`);
    }
}

async function restoreSource(root: string, file: SourceFile, signal: AbortSignal): Promise<void> {
    const path = join(root, file.path);
    const parent = dirname(path);
    const content = await sourceBlob(root, file, signal);
    if ((await Deno.realPath(parent)) !== parent) {
        throw new Error('The original source directory has changed.');
    }
    const mode = file.mode === '100755' ? 0o755 : 0o644;
    await Deno.writeFile(path, content, { createNew: true, mode });
}

async function removeRecordedBatch(
    root: string,
    batchId: string,
    recorded: Awaited<ReturnType<typeof recordBatch>>,
    signal: AbortSignal,
): Promise<void> {
    await ensureArchiveIsNotCheckedOut(root, signal);
    const current = await getArchiveTip(root, signal);
    if (current === undefined) {
        return;
    }
    if (current === recorded.archiveCommit) {
        const args =
            recorded.previous === undefined
                ? ['-d', ARCHIVE_REF, current]
                : [ARCHIVE_REF, recorded.previous, current];
        await git(root, signal, ['update-ref', '--no-deref', ...args]);
        return;
    }
    const entries = await treeEntries(root, current, signal);
    const batch = entries.find(({ path }) => path === batchId);
    if (batch === undefined) {
        return;
    }
    if (batch.oid !== recorded.batchTree) {
        throw new Error(`Archive batch "${batchId}" changed after recording.`);
    }
    const tree = await writeTree(
        root,
        entries.filter((entry) => entry !== batch),
        signal,
    );
    const commit = await commitTree(root, tree, current, `Roll back archive ${batchId}`, signal);
    await git(root, signal, ['update-ref', '--no-deref', ARCHIVE_REF, commit, current]);
}

async function rollback(
    root: string,
    deleted: SourceFile[],
    batchId: string,
    recorded: Awaited<ReturnType<typeof recordBatch>>,
): Promise<string> {
    const signal = new AbortController().signal;
    const failures = [];
    const restored = [];
    for (const file of deleted) {
        try {
            await restoreSource(root, file, signal);
            restored.push(file);
        } catch (error) {
            failures.push(`${file.path}: ${String(error)}`);
        }
    }
    for (const file of restored) {
        try {
            await assertSourceMatches(root, file, await sourceBlob(root, file, signal), signal);
        } catch (error) {
            failures.push(`${file.path}: ${String(error)}`);
        }
    }
    if (failures.length > 0) {
        return `Rollback incomplete. Archive batch retained for manual recovery. Source paths requiring attention:\n${failures.join('\n')}`;
    }
    try {
        await removeRecordedBatch(root, batchId, recorded, signal);
    } catch (error) {
        return `Source files restored. Could not remove the archive batch. Inspect the archive ref for manual recovery. ${String(error)}`;
    }
    return 'Rollback succeeded. Deleted source files restored and failed batch removed.';
}

export async function applyArchive(
    projectRoot: string,
    name: string,
    description: string,
    confirm: () => boolean | Promise<boolean>,
    signal: AbortSignal,
    workingDirectory = projectRoot,
): Promise<ApplyResult> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        throw new Error(
            'Archive batch name must contain lowercase letters or digits separated by single hyphens.',
        );
    }
    if (description.trim() === '') {
        throw new Error('Archive batch description must not be empty.');
    }
    const root = await Deno.realPath(projectRoot);
    let selection: ArchiveSelection;
    try {
        if ((await Deno.realPath(workingDirectory)) !== root) {
            const [sourceCheckout, currentCheckout] = await Promise.all([
                git(root, signal, ['rev-parse', '--show-toplevel']),
                git(workingDirectory, signal, ['rev-parse', '--show-toplevel']),
            ]);
            if (decoder.decode(sourceCheckout) !== decoder.decode(currentCheckout)) {
                throw new Error(
                    'The current Git checkout does not contain the initialized Coderail project.',
                );
            }
        }
        selection = await selectArchive(root, signal);
        if (selection.eligible.length === 0) {
            return { status: 'empty', sourceCommit: selection.sourceCommit };
        }
        if (!(await confirm())) {
            return { status: 'declined', sourceCommit: selection.sourceCommit };
        }
        const rechecked = await selectArchive(root, signal);
        if (
            selection.sourceCommit !== rechecked.sourceCommit ||
            JSON.stringify(selection.eligible) !== JSON.stringify(rechecked.eligible)
        ) {
            throw new Error('Archive selection changed during confirmation. Run preview again.');
        }
    } catch (error) {
        throw new Error(`Archive selection failed. ${String(error)}`, { cause: error });
    }

    const batchId = `${new Date().toISOString().slice(0, 10)}_${name}`;
    let recorded: Awaited<ReturnType<typeof recordBatch>>;
    try {
        recorded = await recordBatch(root, batchId, description, selection, signal);
    } catch (error) {
        throw new Error(
            `Archive recording failed for "${batchId}" (source ${selection.sourceCommit}). ${String(error)}`,
            { cause: error },
        );
    }

    const deleted = [];
    let failingPath = '';
    try {
        for (const file of recorded.files) {
            failingPath = file.path;
            await assertSourceIndexMatches(root, file, signal);
            await assertSourceMatches(root, file, await sourceBlob(root, file, signal), signal);
            signal.throwIfAborted();
            await Deno.remove(join(root, file.path));
            deleted.push(file);
        }
    } catch (error) {
        const recovery = await rollback(root, deleted, batchId, recorded);
        throw new Error(
            `Archive source removal failed at "${failingPath}". ${String(error)}\n${recovery}\nBatch: ${batchId}\nSource commit: ${selection.sourceCommit}\nArchive commit: ${recorded.archiveCommit}`,
            { cause: error },
        );
    }
    return {
        status: 'applied',
        batchId,
        sourceCommit: selection.sourceCommit,
        archiveCommit: recorded.archiveCommit,
        paths: recorded.files.map(({ path }) => path),
    };
}
