import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { dirname, join } from '@std/path';

import { applyArchive } from '../../src/archive/apply.ts';
import {
    ARCHIVE_REF,
    getArchiveTip,
    listArchiveBatches,
    listArchivedPlans,
    listArchivedTickets,
    readArchivedFile,
} from '../../src/archive/history.ts';
import { fixtureGit, rawFile } from './fixtures.ts';

const first = '.coderail/tickets/closed/0001-first.md';
const second = '.coderail/tickets/closed/0002-second.md';
const plan = '.coderail/plans/a-plan/IDEA.md';
const artifact = '.coderail/plans/a-plan/nested/files/[draft] notes.bin';
const sourceBytes = '\uFEFF' + ticket('0001', 'First') + '\r\nOriginal bytes\r\n';
const signal = new AbortController().signal;

function ticket(id: string, title: string): string {
    return `---\nid: "${id}"\nslug: "${title.toLowerCase()}"\ntitle: "${title}"\nstatus: "closed"\nreason: "done"\ncreated_at: "2026-01-01T00:00:00Z"\nupdated_at: "2026-01-01T00:00:00Z"\n---\n`;
}

async function write(root: string, path: string, content: string | Uint8Array): Promise<void> {
    const destination = join(root, path);
    await Deno.mkdir(dirname(destination), { recursive: true });
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    await Deno.writeFile(destination, bytes);
}

async function sourceFixture(
    files: Record<string, string | Uint8Array>,
    run: (root: string) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir();
    try {
        await fixtureGit(root, 'init', '-q');
        await fixtureGit(root, 'config', 'user.name', 'Archive Tester');
        await fixtureGit(root, 'config', 'user.email', 'archive@example.test');
        await fixtureGit(root, 'config', 'commit.gpgsign', 'false');
        await write(root, '.coderail/.gitignore', projectIgnoreLines.join('\n') + '\n');
        await write(root, 'README.md', 'Initial source\n');
        for (const [path, content] of Object.entries(files)) {
            await write(root, path, content);
        }
        await fixtureGit(root, 'add', '.');
        await fixtureGit(root, 'commit', '-qm', 'Source snapshot');
        await run(root);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

function apply(root: string, name = 'batch', abort = signal): ReturnType<typeof applyArchive> {
    return applyArchive(root, name, 'What was archived.', () => true, abort);
}

function dateBatch(name: string): string {
    return `${new Date().toISOString().slice(0, 10)}_${name}`;
}

async function read(root: string, path: string): Promise<string> {
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
        await Deno.readFile(join(root, path)),
    );
}

async function archiveText(root: string, path: string): Promise<string> {
    return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
        await readArchivedFile(root, path, signal),
    );
}

async function checkMissing(root: string, path: string): Promise<void> {
    await expect(Deno.lstat(join(root, path))).rejects.toBeInstanceOf(Deno.errors.NotFound);
}

async function hookRemove(
    hook: (path: string | URL) => void | Promise<void>,
    run: () => Promise<void>,
): Promise<void> {
    const original = Deno.remove;
    Deno.remove = async (path, options) => {
        await hook(path);
        await original(path, options);
    };
    try {
        await run();
    } finally {
        Deno.remove = original;
    }
}

async function hookGit(
    hook: (args: string[]) => void | Promise<void>,
    run: () => Promise<void>,
): Promise<void> {
    const Original = Deno.Command;
    class HookedCommand extends Original {
        constructor(
            command: string | URL,
            private options?: Deno.CommandOptions,
        ) {
            super(command, options);
        }
        override async output(): Promise<Deno.CommandOutput> {
            await hook(this.options?.args ?? []);
            return await super.output();
        }
    }
    Object.assign(Deno, { Command: HookedCommand });
    try {
        await run();
    } finally {
        Object.assign(Deno, { Command: Original });
    }
}

async function commitArchiveTree(root: string, tip: string | undefined): Promise<string> {
    const tree = await fixtureGit(root, 'rev-parse', `${tip ?? 'HEAD'}^{tree}`);
    return await fixtureGit(
        root,
        'commit-tree',
        tree,
        ...(tip === undefined ? [] : ['-p', tip]),
        '-m',
        'Competing archive commit',
    );
}

Deno.test(
    'apply creates a parentless archive with browsable remapped links and preserves the source index',
    async () => {
        const linkedTicket = `${sourceBytes}\n[Plan](../../plans/a-plan/IDEA.md#section)\n`;
        const idea = [
            '---',
            'title: "A plan"',
            'status: "archived"',
            '---',
            '',
            '[Ticket](../../tickets/closed/0001-first.md?via=idea#ticket)',
            '[Artifact](nested/files/%5Bdraft%5D%20notes.bin)',
            '[Directory](nested/files)',
            '[Same directory](./#section)',
            '[Outside](../../../../README.md)',
            '[Retained](../retained.md)',
            '[External](https://example.com/0001-first.md)',
            '',
        ].join('\n');
        await sourceFixture(
            {
                [first]: linkedTicket,
                [second]: ticket('0002', 'Second'),
                [plan]: idea,
                [artifact]: rawFile,
                '.coderail/plans/retained.md': 'Retained resource',
            },
            async (root) => {
                await Deno.writeTextFile(join(root, 'README.md'), 'Staged change');
                await fixtureGit(root, 'add', 'README.md');
                await Deno.writeTextFile(join(root, 'README.md'), 'Unstaged change');
                await Deno.writeTextFile(join(root, 'local.txt'), 'Untracked');
                const initialIndex = await Deno.readFile(join(root, '.git/index'));
                const sourceCommit = await fixtureGit(root, 'rev-parse', 'HEAD');
                const branch = await fixtureGit(root, 'symbolic-ref', 'HEAD');
                const result = await apply(root, 'grouped-work');
                const batchId = dateBatch('grouped-work');
                const archiveCommit = await fixtureGit(root, 'rev-parse', ARCHIVE_REF);
                expect(result).toEqual({
                    status: 'applied',
                    batchId,
                    sourceCommit,
                    archiveCommit,
                    paths: [plan, artifact, first, second],
                });
                expect(await fixtureGit(root, 'rev-list', '--parents', ARCHIVE_REF)).toBe(
                    archiveCommit,
                );
                expect(await listArchiveBatches(root, signal)).toEqual([batchId]);
                expect(await listArchivedPlans(root, batchId, signal)).toEqual([
                    {
                        title: 'A plan',
                        parent: null,
                        path: `${batchId}/plans/a-plan/IDEA.md`,
                        artifacts: [`${batchId}/plans/a-plan/nested/files/[draft] notes.bin`],
                    },
                ]);
                expect(
                    (await listArchivedTickets(root, batchId, signal)).map(({ id }) => id),
                ).toEqual(['0001', '0002']);
                expect(await archiveText(root, `${batchId}/plans/a-plan/IDEA.md`)).toBe(
                    idea
                        .replace('../../tickets/closed/', '../../tickets/')
                        .replace('nested/files)', 'nested/files/)'),
                );
                expect(await archiveText(root, `${batchId}/tickets/0001-first.md`)).toBe(
                    linkedTicket.replace('../../plans/', '../plans/'),
                );
                expect(
                    await readArchivedFile(
                        root,
                        `${batchId}/plans/a-plan/nested/files/[draft] notes.bin`,
                        signal,
                    ),
                ).toEqual(rawFile);
                const overview = await archiveText(root, `${batchId}/README.md`);
                expect(overview).toContain('What was archived.');
                expect(overview).toContain('[plans/a-plan/IDEA.md](plans/a-plan/IDEA.md)');
                expect(overview).toContain('[tickets/0002-second.md](tickets/0002-second.md)');
                expect(overview).not.toContain('](tickets/0001-first.md)');
                expect(overview).toContain(`Source revision: ${sourceCommit}`);
                expect(overview).toContain(`- ${JSON.stringify(artifact)}`);
                expect(await Deno.readFile(join(root, '.git/index'))).toEqual(initialIndex);
                expect(await fixtureGit(root, 'rev-parse', 'HEAD')).toBe(sourceCommit);
                expect(await fixtureGit(root, 'symbolic-ref', 'HEAD')).toBe(branch);
                expect(await read(root, 'README.md')).toBe('Unstaged change');
                expect(await read(root, 'local.txt')).toBe('Untracked');
                for (const path of [plan, artifact, first, second]) {
                    await checkMissing(root, path);
                }
            },
        );
    },
);

Deno.test(
    'later batches can repeat IDs and plan paths while collisions leave existing batches and source intact',
    async () => {
        const idea =
            '---\ntitle: "Original plan"\nstatus: "archived"\n---\n\n[Ticket](../../tickets/closed/0001-first.md)\n';
        await sourceFixture({ [first]: sourceBytes, [plan]: idea }, async (root) => {
            await apply(root, 'one');
            const old = await getArchiveTip(root, signal);
            await write(root, first, sourceBytes + 'New ticket with reused ID\n');
            await write(root, plan, idea.replace('Original', 'Replacement'));
            await fixtureGit(root, 'add', '.');
            await fixtureGit(root, 'commit', '-qm', 'New source records');
            await expect(apply(root, 'one')).rejects.toThrow('already exists');
            expect(await getArchiveTip(root, signal)).toBe(old);
            expect(await read(root, first)).toContain('reused ID');
            await apply(root, 'two');
            const after = await getArchiveTip(root, signal);
            expect(await fixtureGit(root, 'rev-list', '--parents', '-1', ARCHIVE_REF)).toBe(
                `${after} ${old}`,
            );
            expect(await listArchiveBatches(root, signal)).toEqual([
                dateBatch('one'),
                dateBatch('two'),
            ]);
            expect(await archiveText(root, `${dateBatch('one')}/tickets/0001-first.md`)).toBe(
                sourceBytes,
            );
            expect(await archiveText(root, `${dateBatch('two')}/tickets/0001-first.md`)).toContain(
                'reused ID',
            );
            expect(await archiveText(root, `${dateBatch('two')}/plans/a-plan/IDEA.md`)).toContain(
                'Replacement plan',
            );
        });
    },
);

Deno.test(
    'selection errors, empty selection, approval decline, and approval-time changes do not record a batch',
    async () => {
        await sourceFixture({}, async (root) => {
            const sourceCommit = await fixtureGit(root, 'rev-parse', 'HEAD');
            expect(
                await applyArchive(
                    root,
                    'empty',
                    'Description',
                    () => {
                        throw Error('unexpected prompt');
                    },
                    signal,
                ),
            ).toEqual({ status: 'empty', sourceCommit });
            expect(await getArchiveTip(root, signal)).toBeUndefined();
        });
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            const sourceCommit = await fixtureGit(root, 'rev-parse', 'HEAD');
            expect(
                await applyArchive(root, 'declined', 'Description', () => false, signal),
            ).toEqual({ status: 'declined', sourceCommit });
            for (const name of ['Upper', 'two--hyphens', '../escape', 'name_with_space', 'a-']) {
                await expect(apply(root, name)).rejects.toThrow('batch name');
            }
            await expect(applyArchive(root, 'batch', '  ', () => true, signal)).rejects.toThrow(
                'description',
            );
            expect(await getArchiveTip(root, signal)).toBeUndefined();
            expect(await read(root, first)).toBe(sourceBytes);
            await expect(
                applyArchive(
                    root,
                    'batch',
                    'Description',
                    async () => {
                        await write(root, first, `${sourceBytes}Edited during confirmation.`);
                        return true;
                    },
                    signal,
                ),
            ).rejects.toThrow(' differs in the working tree');
            expect(await read(root, first)).toContain('Edited during confirmation');
            await write(root, first, sourceBytes);
            await expect(
                applyArchive(
                    root,
                    'batch',
                    'Description',
                    async () => {
                        await fixtureGit(
                            root,
                            'commit',
                            '--allow-empty',
                            '-qm',
                            'Moved HEAD during confirmation',
                        );
                        return true;
                    },
                    signal,
                ),
            ).rejects.toThrow('selection changed during confirmation');
            await expect(
                applyArchive(
                    root,
                    'batch',
                    'Description',
                    async () => {
                        await write(
                            root,
                            '.coderail/retained.md',
                            '[Keep](tickets/closed/0001-first.md)\n',
                        );
                        return true;
                    },
                    signal,
                ),
            ).rejects.toThrow('selection changed during confirmation');
            await write(root, '.coderail/retained.md', '[Stale](tickets/open/0001-first.md)\n');
            await expect(apply(root)).rejects.toThrow('Stale archive link');
            expect(await getArchiveTip(root, signal)).toBeUndefined();
            expect(await read(root, first)).toBe(sourceBytes);
        });
    },
);

Deno.test(
    'a competing archive update blocks publication without replacing either checkout or ref',
    async () => {
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            const other = await commitArchiveTree(root, undefined);
            await hookGit(
                async ([command, , ref]) => {
                    if (command === 'update-ref' && ref === ARCHIVE_REF) {
                        await fixtureGit(root, 'update-ref', ARCHIVE_REF, other);
                    }
                },
                async () => {
                    await expect(apply(root)).rejects.toThrow('Archive recording failed');
                },
            );
            expect(await getArchiveTip(root, signal)).toBe(other);
            expect(await read(root, first)).toBe(sourceBytes);
        });
    },
);

Deno.test(
    'failed source deletion restores exact originals, removes its first archive batch and reports the failed operation',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                const index = await Deno.readFile(join(root, '.git/index'));
                await hookRemove(
                    async (path) => {
                        if (path === join(root, second)) {
                            await checkMissing(root, first);
                            expect(await getArchiveTip(root, signal)).toMatch(/^[0-9a-f]+$/);
                            throw Error('Simulated removal failure');
                        }
                    },
                    async () => {
                        await expect(apply(root)).rejects.toThrow(
                            /Archive source removal failed.*0002-second\.md.*\nRollback succeeded\..*\nBatch: .*_batch\nSource commit: [a-f\d]+\nArchive commit: [a-f\d]+/s,
                        );
                    },
                );
                expect(await getArchiveTip(root, signal)).toBeUndefined();
                expect(await read(root, first)).toBe(sourceBytes);
                expect(await read(root, second)).toBe(ticket('0002', 'Second'));
                expect(await Deno.readFile(join(root, '.git/index'))).toEqual(index);
                expect((await apply(root)).status).toBe('applied');
            },
        );
    },
);

Deno.test(
    'an edit before deletion stops cleanup and rollback retains existing archive batches',
    async () => {
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            await apply(root, 'previous');
            const previous = await getArchiveTip(root, signal);
            await write(root, first, sourceBytes);
            await write(root, second, ticket('0002', 'Second'));
            await fixtureGit(root, 'add', '.');
            await fixtureGit(
                root,
                'commit',
                '--allow-empty',
                '-qm',
                'Group for subsequent archive',
            );
            await hookRemove(
                async (path) => {
                    if (path === join(root, first)) {
                        await write(root, second, 'Uncommitted concurrent edit');
                    }
                },
                async () => {
                    await expect(apply(root)).rejects.toThrow(
                        /0002-second\.md.*changed.*Rollback succeeded/s,
                    );
                },
            );
            expect(await getArchiveTip(root, signal)).toBe(previous);
            expect(await listArchiveBatches(root, signal)).toEqual([dateBatch('previous')]);
            expect(await read(root, first)).toBe(sourceBytes);
            expect(await read(root, second)).toBe('Uncommitted concurrent edit');
        });
    },
);

Deno.test(
    'an interruption after one deletion restores the original without using the aborted signal',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                const controller = new AbortController();
                await hookRemove(
                    (path) => {
                        if (path === join(root, first)) {
                            controller.abort();
                        }
                    },
                    async () => {
                        await expect(apply(root, 'interrupted', controller.signal)).rejects.toThrow(
                            'Rollback succeeded.',
                        );
                    },
                );
                expect(await getArchiveTip(root, signal)).toBeUndefined();
                expect(await read(root, first)).toBe(sourceBytes);
            },
        );
    },
);

Deno.test(
    'rollback preserves a competing restoration path and leaves committed recovery bytes available',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                await hookRemove(
                    async (path) => {
                        if (path === join(root, second)) {
                            await write(root, first, 'A conflicting new file');
                            throw Error('Deletion failed after another writer');
                        }
                    },
                    async () => {
                        await expect(apply(root)).rejects.toThrow(
                            /Deletion failed after another writer.*Rollback incomplete.*Source paths requiring attention:\n\.coderail\/tickets\/closed\/0001-first\.md/s,
                        );
                    },
                );
                expect(await read(root, first)).toBe('A conflicting new file');
                expect(await archiveText(root, `${dateBatch('batch')}/tickets/0001-first.md`)).toBe(
                    sourceBytes,
                );
            },
        );
    },
);

Deno.test(
    'rollback keeps archive accessible if the ref cannot be updated after restoring source files',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                await hookGit(
                    (args) => {
                        if (args[0] === 'update-ref' && args.includes('-d')) {
                            throw Error('Change to archive ref rejected');
                        }
                    },
                    async () => {
                        await hookRemove(
                            (path) => {
                                if (path === join(root, second)) {
                                    throw Error('Deletion failed');
                                }
                            },
                            async () => {
                                await expect(apply(root)).rejects.toThrow(
                                    /Deletion failed.*Source files restored.*Could not remove the archive batch.*Change to archive ref rejected/s,
                                );
                            },
                        );
                    },
                );
                expect(await read(root, first)).toBe(sourceBytes);
                expect(await archiveText(root, `${dateBatch('batch')}/tickets/0001-first.md`)).toBe(
                    sourceBytes,
                );
            },
        );
    },
);

Deno.test(
    'rollback appends a compensating commit when another archive batch has appeared',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                let concurrentTip = '';
                await hookRemove(
                    async (path) => {
                        if (path === join(root, second)) {
                            const otherIndex = join(root, '.git/archive-test.index');
                            const git = async (...args: string[]): Promise<string> => {
                                const output = await new Deno.Command('git', {
                                    cwd: root,
                                    args,
                                    env: { GIT_INDEX_FILE: otherIndex },
                                }).output();
                                if (!output.success) {
                                    throw Error(new TextDecoder().decode(output.stderr));
                                }
                                return new TextDecoder().decode(output.stdout).trim();
                            };
                            const tip = await fixtureGit(root, 'rev-parse', ARCHIVE_REF);
                            await git('read-tree', tip);
                            const batch = dateBatch('other');
                            await write(root, `${batch}/README.md`, 'Concurrent archive');
                            await git('add', `${batch}/README.md`);
                            const tree = await git('write-tree');
                            concurrentTip = await git(
                                'commit-tree',
                                tree,
                                '-p',
                                tip,
                                '-m',
                                'Concurrent archive',
                            );
                            await git('update-ref', ARCHIVE_REF, concurrentTip, tip);
                            throw Error('Deletion failed with another batch added');
                        }
                    },
                    async () => {
                        await expect(apply(root)).rejects.toThrow('Rollback succeeded.');
                    },
                );
                expect(await fixtureGit(root, 'rev-parse', `${ARCHIVE_REF}^`)).toBe(concurrentTip);
                expect(await listArchiveBatches(root, signal)).toEqual([dateBatch('other')]);
                expect(await archiveText(root, `${dateBatch('other')}/README.md`)).toBe(
                    'Concurrent archive',
                );
                expect(await read(root, first)).toBe(sourceBytes);
            },
        );
    },
);

Deno.test(
    'apply refuses to advance an archive branch checked out by another worktree',
    async () => {
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            const previous = await commitArchiveTree(root, undefined);
            await fixtureGit(root, 'update-ref', ARCHIVE_REF, previous);
            const worktree = join(root, 'archive-worktree');
            await fixtureGit(root, 'worktree', 'add', worktree, 'coderail/archive-history');
            await expect(apply(root)).rejects.toThrow('archive branch is checked out');
            expect(await getArchiveTip(root, signal)).toBe(previous);
            expect(await read(root, first)).toBe(sourceBytes);
        });
    },
);

Deno.test(
    'apply treats vanished archive content as already rolled back and preserves an independently replaced batch',
    async () => {
        for (const scenario of ['deleted ref', 'removed batch', 'replaced batch']) {
            await sourceFixture(
                { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
                async (root) => {
                    let changedTip: string | undefined;
                    await hookRemove(
                        async (path) => {
                            if (path !== join(root, second)) {
                                return;
                            }
                            if (scenario === 'deleted ref') {
                                await fixtureGit(root, 'update-ref', '-d', ARCHIVE_REF);
                            } else {
                                if (scenario === 'replaced batch') {
                                    await write(
                                        root,
                                        `${dateBatch('batch')}/README.md`,
                                        'A different batch',
                                    );
                                    await fixtureGit(
                                        root,
                                        'add',
                                        `${dateBatch('batch')}/README.md`,
                                    );
                                    const tree = await fixtureGit(root, 'write-tree');
                                    changedTip = await fixtureGit(
                                        root,
                                        'commit-tree',
                                        tree,
                                        '-m',
                                        'Replaced batch',
                                    );
                                } else {
                                    changedTip = await commitArchiveTree(root, undefined);
                                }
                                await fixtureGit(root, 'update-ref', ARCHIVE_REF, changedTip);
                            }
                            throw Error('Deletion failed after archive changed');
                        },
                        async () => {
                            await expect(apply(root)).rejects.toThrow(
                                scenario === 'replaced batch'
                                    ? 'changed after recording'
                                    : 'Rollback succeeded',
                            );
                        },
                    );
                    expect(await getArchiveTip(root, signal)).toBe(changedTip);
                    expect(await read(root, first)).toBe(sourceBytes);
                },
            );
        }
    },
);

Deno.test(
    'apply refuses source files that disappear from the committed tree during packaging',
    async () => {
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            const Original = Deno.Command;
            let scans = 0;
            class HookedCommand extends Original {
                constructor(
                    command: string | URL,
                    private options?: Deno.CommandOptions,
                ) {
                    super(command, options);
                }
                override async output(): Promise<Deno.CommandOutput> {
                    const output = await super.output();
                    if (this.options?.args?.[0] === 'ls-tree' && ++scans === 3) {
                        return { ...output, stdout: new Uint8Array() };
                    }
                    return output;
                }
            }
            Object.assign(Deno, { Command: HookedCommand });
            try {
                await expect(apply(root)).rejects.toThrow('Cannot read archive source file');
            } finally {
                Object.assign(Deno, { Command: Original });
            }
            expect(await getArchiveTip(root, signal)).toBeUndefined();
            expect(await read(root, first)).toBe(sourceBytes);
        });
    },
);

Deno.test(
    'apply verifies executable modes, exact bytes, and source paths before deletion and restoration',
    async () => {
        const third = '.coderail/tickets/closed/0003-third.md';
        for (const conflict of [
            'different bytes',
            'directory',
            'changed mode',
            'redirected deletion',
            'redirected restoration',
            'edited restoration',
        ]) {
            await sourceFixture(
                {
                    [first]: sourceBytes,
                    [second]: ticket('0002', 'Second'),
                    [third]: ticket('0003', 'Third'),
                },
                async (root) => {
                    const path = join(root, first);
                    await Deno.chmod(path, 0o755);
                    await fixtureGit(root, 'add', '--chmod=+x', first);
                    await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Executable ticket');
                    const originalLstat = Deno.lstat;
                    Deno.lstat = async (path) => {
                        const result = await originalLstat(path);
                        return path === join(root, third) ? { ...result, mode: null } : result;
                    };
                    const parent = join(root, dirname(first));
                    // For redirected deletion, the first file is deleted before the directory is replaced.
                    const displaced = join(root, 'displaced');
                    const realRemove = Deno.remove;
                    try {
                        await hookRemove(
                            async (path) => {
                                if (path === join(root, first)) {
                                    if (conflict === 'different bytes') {
                                        await Deno.writeTextFile(
                                            join(root, second),
                                            ticket('0002', 'Second').replace('Second', 'Seconf'),
                                        );
                                    } else if (conflict === 'directory') {
                                        await realRemove(join(root, second));
                                        await Deno.mkdir(join(root, second));
                                    } else if (conflict === 'changed mode') {
                                        await Deno.chmod(join(root, second), 0o755);
                                    }
                                }
                                if (
                                    path === join(root, second) &&
                                    conflict === 'redirected restoration'
                                ) {
                                    await Deno.rename(parent, displaced);
                                    await Deno.symlink(displaced, parent, { type: 'dir' });
                                    throw Error('Directory changed before restoration');
                                }
                                if (
                                    path === join(root, second) &&
                                    conflict === 'redirected deletion'
                                ) {
                                    await realRemove(path);
                                    await Deno.rename(parent, displaced);
                                    await Deno.symlink(displaced, parent, { type: 'dir' });
                                }
                                if (
                                    path === join(root, third) &&
                                    conflict === 'edited restoration'
                                ) {
                                    const originalWrite = Deno.writeFile;
                                    Deno.writeFile = async (path, data, opts) => {
                                        await originalWrite(path, data, opts);
                                        if (path === join(root, second)) {
                                            await Deno.writeTextFile(
                                                join(root, first),
                                                'Another writer changed restored content',
                                            );
                                        }
                                    };
                                    throw Error('Cannot delete the third source');
                                }
                            },
                            async () => {
                                const originalWrite = Deno.writeFile;
                                try {
                                    const incomplete =
                                        conflict.startsWith('redirected') ||
                                        conflict === 'edited restoration';
                                    await expect(apply(root)).rejects.toThrow(
                                        incomplete ? 'Rollback incomplete' : 'Rollback succeeded',
                                    );
                                    if (incomplete) {
                                        expect(await getArchiveTip(root, signal)).toMatch(
                                            /^[a-f0-9]+$/,
                                        );
                                    } else {
                                        expect(await getArchiveTip(root, signal)).toBeUndefined();
                                        expect(await read(root, first)).toBe(sourceBytes);
                                        expect(
                                            ((await Deno.stat(join(root, first))).mode ?? 0) &
                                                0o100,
                                        ).toBe(0o100);
                                    }
                                } finally {
                                    Deno.writeFile = originalWrite;
                                }
                            },
                        );
                    } finally {
                        Deno.lstat = originalLstat;
                    }
                },
            );
        }
    },
);

Deno.test(
    'a concurrent staged source update aborts the deletion without discarding the staged bytes',
    async () => {
        await sourceFixture(
            { [first]: sourceBytes, [second]: ticket('0002', 'Second') },
            async (root) => {
                const committed = ticket('0002', 'Second');
                let stagedIndex: Uint8Array | undefined;
                await hookRemove(
                    async (path) => {
                        if (path === join(root, first)) {
                            await write(root, second, 'New staged contents');
                            await fixtureGit(root, 'add', second);
                            await write(root, second, committed);
                            stagedIndex = await Deno.readFile(join(root, '.git/index'));
                        }
                    },
                    async () => {
                        await expect(apply(root)).rejects.toThrow(
                            'Archive source file changed in the index',
                        );
                    },
                );
                expect(await getArchiveTip(root, signal)).toBeUndefined();
                expect(await read(root, first)).toBe(sourceBytes);
                expect(await read(root, second)).toBe(committed);
                expect(await Deno.readFile(join(root, '.git/index'))).toEqual(stagedIndex);
            },
        );
    },
);

Deno.test(
    'apply can start below the project root but refuses independent nested checkouts',
    async () => {
        await sourceFixture({ [first]: sourceBytes }, async (root) => {
            const subdirectory = join(root, '.coderail');
            const nestedCheckout = join(subdirectory, 'nested-checkout');
            await Deno.mkdir(nestedCheckout);
            await fixtureGit(nestedCheckout, 'init', '-q');
            await expect(
                applyArchive(
                    root,
                    'different',
                    'Wrong checkout',
                    () => true,
                    signal,
                    nestedCheckout,
                ),
            ).rejects.toThrow('The current Git checkout does not contain');
            expect(await read(root, first)).toBe(sourceBytes);
            expect(await getArchiveTip(root, signal)).toBeUndefined();
            expect(
                (
                    await applyArchive(
                        root,
                        'same',
                        'Right checkout',
                        () => true,
                        signal,
                        subdirectory,
                    )
                ).status,
            ).toBe('applied');
            await checkMissing(root, first);
        });
    },
);
