import { expect } from '@std/expect';
import { dirname, join } from '@std/path';

import { selectArchive } from '../../src/archive/selection.ts';
import { runRepairs } from '../../src/commands/doctor/repairs.ts';
import { Tickets } from '../../src/commands/doctor/tickets.ts';
import type { DoctorRepair } from '../../src/commands/doctor/types.ts';

const signal = new AbortController().signal;

async function git(root: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd: root,
        args: ['-c', 'user.name=Archive Tests', '-c', 'user.email=archive@example.test', ...args],
        env: { GIT_OPTIONAL_LOCKS: '0' },
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout).trim();
}

async function write(root: string, path: string, text: string): Promise<void> {
    const filename = join(root, path);
    await Deno.mkdir(dirname(filename), { recursive: true });
    await Deno.writeTextFile(filename, text);
}

function ticket(id: string, status: string, extra = '', body = ''): Record<string, string> {
    return {
        [`.coderail/tickets/${status}/${id}-ticket-${id}.md`]:
            `---\nid: "${id}"\nslug: "ticket-${id}"\ntitle: "Ticket ${id}"\nstatus: "${status}"\ncreated_at: "2026-11-25"\nupdated_at: "2026-11-25"\n` +
            (status === 'closed' && !extra.includes('reason:') ? 'reason: "done"\n' : '') +
            extra +
            `---\n${body}`,
    };
}

function idea(path: string, status: string, body = ''): Record<string, string> {
    return {
        [`.coderail/plans/${path}/IDEA.md`]: `---\ntitle: "An idea"\nstatus: "${status}"\n---\n${body}`,
    };
}

async function withProject(
    files: Record<string, string>,
    run: (root: string) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '-q');
        const fixture = { '.coderail/config': '', ...files };
        for (const [path, content] of Object.entries(fixture)) {
            await write(root, path, content);
        }
        await git(root, 'add', '.');
        await git(root, 'commit', '-qm', 'Initial fixture', '--no-gpg-sign');
        await run(root);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

async function assertReadOnly(root: string, run: () => Promise<void>): Promise<void> {
    const refs = await git(root, 'show-ref');
    const index = await Deno.readFile(join(root, '.git', 'index'));
    const status = await git(root, 'status', '--short', '-uall');
    const diff = await git(root, 'diff', '--no-ext-diff');
    await run();
    expect(await git(root, 'show-ref')).toBe(refs);
    expect(await Deno.readFile(join(root, '.git', 'index'))).toEqual(index);
    expect(await git(root, 'status', '--short', '-uall')).toBe(status);
    expect(await git(root, 'diff', '--no-ext-diff')).toBe(diff);
}

Deno.test(
    'preview selects complete committed groups with legacy and recursive artifacts',
    async () => {
        await withProject(
            {
                ...ticket('0001', 'closed'),
                ...ticket('0002', 'closed'),
                ...ticket('0003', 'closed', 'dependencies: ["0002"]\n'),
                ...idea('legacy', 'archived', '[Related plan](../linked/notes/a.md)\n'),
                '.coderail/plans/legacy/files/nested/manual.txt': 'kept intact',
                ...idea('linked', 'archived'),
                '.coderail/plans/linked/notes/a.md':
                    '[Ticket](../../../tickets/closed/0003-ticket-0003.md#details)\n' +
                    '[Outside](../../../../missing.md)\n' +
                    '[External](https://example.test/.coderail/tickets/open/0001-ticket-0001.md)\n' +
                    'Prose: ../../../tickets/open/0003-ticket-0003.md\n',
                'README.md': '[Out of scope](.coderail/tickets/closed/0001-ticket-0001.md)\n',
            },
            async (root) => {
                await write(root, 'README.md', 'Unrelated working edit');
                await write(root, 'notes.txt', 'Unrelated staged edit');
                await git(root, 'add', 'notes.txt');
                await assertReadOnly(root, async () => {
                    const result = await selectArchive(root, signal);
                    expect(result.sourceCommit).toBe(await git(root, 'rev-parse', 'HEAD'));
                    expect(result.deferred).toEqual([]);
                    expect(result.eligible).toEqual([
                        {
                            plans: ['.coderail/plans/legacy', '.coderail/plans/linked'],
                            tickets: [
                                '.coderail/tickets/closed/0002-ticket-0002.md',
                                '.coderail/tickets/closed/0003-ticket-0003.md',
                            ],
                            paths: [
                                '.coderail/plans/legacy/IDEA.md',
                                '.coderail/plans/legacy/files/nested/manual.txt',
                                '.coderail/plans/linked/IDEA.md',
                                '.coderail/plans/linked/notes/a.md',
                                '.coderail/tickets/closed/0002-ticket-0002.md',
                                '.coderail/tickets/closed/0003-ticket-0003.md',
                            ],
                        },
                        {
                            plans: [],
                            tickets: ['.coderail/tickets/closed/0001-ticket-0001.md'],
                            paths: ['.coderail/tickets/closed/0001-ticket-0001.md'],
                        },
                    ]);
                });
            },
        );
    },
);

Deno.test(
    'preview explains split descendants, open tickets, duplicate chains, and retained documents',
    async () => {
        await withProject(
            {
                ...idea('split', 'split'),
                ...idea('split/finished', 'archived', '[Another](../../finished/IDEA.md)\n'),
                ...idea('split/ongoing', 'split'),
                ...idea('split/ongoing/child', 'open'),
                ...idea('finished', 'archived'),
                ...idea(
                    'has-ticket',
                    'archived',
                    '[Active](../../tickets/active/0005-ticket-0005.md)\n',
                ),
                ...idea('linked', 'archived'),
                '.coderail/plans/linked/docs/one.md': 'Artifact document.',
                '.coderail/HANDBOOK.md': '[Retained reference](plans/linked/docs/one.md)',
                ...ticket('0001', 'open', 'dependencies: ["0002"]\n'),
                ...ticket('0002', 'closed', 'reason: "duplicate"\nduplicate-of: "0003"\n'),
                ...ticket('0003', 'closed', 'reason: "duplicate"\nduplicate-of: "0004"\n'),
                ...ticket('0004', 'closed'),
                ...ticket('0005', 'active'),
                ...ticket('0006', 'closed', 'dependencies: ["0005"]\n'),
            },
            async (root) => {
                const { eligible, deferred } = await selectArchive(root, signal);
                expect(eligible).toEqual([]);
                expect(deferred).toHaveLength(5);
                expect(
                    deferred.map(({ plans, tickets, reasons }) => ({ plans, tickets, reasons })),
                ).toEqual([
                    {
                        plans: [
                            '.coderail/plans/finished',
                            '.coderail/plans/split',
                            '.coderail/plans/split/finished',
                            '.coderail/plans/split/ongoing',
                        ],
                        tickets: [],
                        reasons: [
                            'Child plan must stay: .coderail/plans/split/ongoing/child (open).',
                        ],
                    },
                    {
                        plans: ['.coderail/plans/has-ticket'],
                        tickets: [],
                        reasons: [
                            'Linked ticket must stay: .coderail/tickets/active/0005-ticket-0005.md (active).',
                        ],
                    },
                    {
                        plans: ['.coderail/plans/linked'],
                        tickets: [],
                        reasons: ['Referenced by retained Markdown: .coderail/HANDBOOK.md.'],
                    },
                    {
                        plans: [],
                        tickets: [
                            '.coderail/tickets/closed/0002-ticket-0002.md',
                            '.coderail/tickets/closed/0003-ticket-0003.md',
                            '.coderail/tickets/closed/0004-ticket-0004.md',
                        ],
                        reasons: [
                            'Ticket must stay: .coderail/tickets/open/0001-ticket-0001.md (open dependency).',
                        ],
                    },
                    {
                        plans: [],
                        tickets: ['.coderail/tickets/closed/0006-ticket-0006.md'],
                        reasons: [
                            'Ticket must stay: .coderail/tickets/active/0005-ticket-0005.md (active dependency).',
                        ],
                    },
                ]);
            },
        );
    },
);

Deno.test('preview ignores ordinary documentation under tickets as destinations', async () => {
    await withProject(
        {
            ...ticket('0001', 'closed'),
            '.coderail/README.md': '[Ticket guide](tickets/README.md)\n',
            '.coderail/tickets/README.md': 'Ticket documentation.\n',
        },
        async (root) => {
            const result = await selectArchive(root, signal);
            expect(result.deferred).toEqual([]);
            expect(result.eligible[0]?.tickets).toEqual([
                '.coderail/tickets/closed/0001-ticket-0001.md',
            ]);
        },
    );
});

Deno.test('doctor repairs stale ticket-to-ticket links that block archive preview', async () => {
    const source = '.coderail/tickets/closed/0002-ticket-0002.md';
    const current = '0001-ticket-0001.md';
    const stale = '../open/0001-ticket-0001.md?view=plain#details';
    const body = [
        `[Stale](${stale})`,
        `![File linked as a directory](${current}/#details)`,
        '[Missing](9999-missing.md)',
        '[Wrong slug](0001-wrong.md)',
        `[Current](${current})`,
        `\`[Example](${stale})\``,
    ].join('\r\n');
    const sourceTicket = ticket('0002', 'closed', '', body);
    await withProject({ ...ticket('0001', 'closed'), ...sourceTicket }, async (root) => {
        const repairs = new Map<string, DoctorRepair>();
        await assertReadOnly(root, async () => {
            await expect(selectArchive(root, signal)).rejects.toThrow(
                `Stale archive link in "${source}": "${stale}". Run "cr doctor"`,
            );
            const { failures } = await Tickets.check(root, signal);
            expect(failures).toHaveLength(4);
            for (const [index, [message, destination, label, value]] of [
                [
                    'Stale ticket link · 0001',
                    stale,
                    'Expected link',
                    `${current}?view=plain#details`,
                ],
                [
                    'Stale ticket link · 0001',
                    `${current}/#details`,
                    'Expected link',
                    `${current}#details`,
                ],
                [
                    'Unresolved ticket link · 9999',
                    '9999-missing.md',
                    'Target',
                    'Missing target "9999"',
                ],
                [
                    'Unresolved ticket link · 0001',
                    '0001-wrong.md',
                    'Target',
                    `Ticket has authoritative slug "ticket-0001" at "${join('.coderail', 'tickets', 'closed', current)}"`,
                ],
            ].entries()) {
                expect(failures[index]).toMatchObject({
                    message,
                    details: [
                        { label: 'Ticket', value: join(source) },
                        { label: 'Current link', value: destination },
                        { label, value },
                    ],
                    repairable: index < 2,
                });
                const repair = failures[index]?.repair;
                if (repair !== undefined) {
                    repairs.set(repair.key, repair);
                }
            }
        });

        expect(repairs.size).toBe(1);
        expect(await runRepairs([...repairs.values()], signal)).toEqual([
            {
                key: 'ticket-link:0002:0001',
                description: 'Update links from ticket "0002" to ticket "0001"',
            },
        ]);
        const repaired = await Deno.readTextFile(join(root, source));
        expect(repaired).toBe(
            sourceTicket[source]
                ?.replace(stale, `${current}?view=plain#details`)
                .replace(`${current}/#details`, `${current}#details`),
        );
        expect((await Tickets.check(root, signal)).failures.map(({ message }) => message)).toEqual([
            'Unresolved ticket link · 9999',
            'Unresolved ticket link · 0001',
        ]);
        await write(
            root,
            source,
            repaired.replace('[Missing](9999-missing.md)\r\n[Wrong slug](0001-wrong.md)\r\n', ''),
        );
        await git(root, 'commit', '-qam', 'Correct ticket links', '--no-gpg-sign');
        expect((await Tickets.check(root, signal)).failures).toEqual([]);
        expect((await selectArchive(root, signal)).eligible[0]?.tickets).toEqual([
            '.coderail/tickets/closed/0001-ticket-0001.md',
            source,
        ]);
    });
});

for (const [label, link] of [
    ['ticket with same ID in another location', '../../tickets/open/0001-ticket-0001.md'],
    ['unknown plan artifact', '../reference/missing.md'],
    ['file ticket linked as a directory', '../../tickets/closed/0001-ticket-0001.md/#details'],
    ['file artifact linked as a directory', '../reference/data.txt/'],
    ['file artifact with an encoded trailing slash', '../reference/data.txt%2F?raw=1'],
    ['file artifact followed by a directory dot', '../reference/data.txt/.'],
]) {
    Deno.test(
        `preview rejects stale ${label} without changing files, the index, or refs`,
        async () => {
            await withProject(
                {
                    ...ticket('0001', 'closed'),
                    ...idea('reference', 'open'),
                    '.coderail/plans/reference/data.txt': 'A regular artifact.',
                    ...idea('subject', 'archived', `[Stale reference](${link})\n`),
                },
                async (root) => {
                    await assertReadOnly(root, async () => {
                        await expect(selectArchive(root, signal)).rejects.toThrow(
                            `Stale archive link in ".coderail/plans/subject/IDEA.md": "${link}"`,
                        );
                    });
                },
            );
        },
    );
}

const artifact = '.coderail/plans/legacy/nested/data.txt';
for (const [label, change, message] of [
    [
        'staged',
        async (root: string) => {
            await write(root, artifact, 'staged');
            await git(root, 'add', artifact);
            await write(root, artifact, 'original');
        },
        'differs in the index',
    ],
    ['unstaged', (root: string) => write(root, artifact, 'changed'), 'differs in the working tree'],
    [
        'untracked',
        (root: string) => write(root, join(dirname(artifact), 'new.txt'), 'new'),
        'uncommitted',
    ],
    ['missing', (root: string) => Deno.remove(join(root, artifact)), 'file is missing'],
] as const) {
    Deno.test(`preview rejects a ${label} candidate artifact`, async () => {
        await withProject(
            {
                ...idea('legacy', 'archived'),
                [artifact]: 'original',
            },
            async (root) => {
                await change(root);
                await assertReadOnly(root, async () => {
                    await expect(selectArchive(root, signal)).rejects.toThrow(message);
                });
            },
        );
    });
}

Deno.test(
    'preview tolerates edits on deferred records while validating retained links',
    async () => {
        await withProject(
            {
                ...idea('retained', 'ready'),
                ...ticket('0001', 'closed'),
                ...ticket('0002', 'closed'),
            },
            async (root) => {
                for (const [path, content] of Object.entries(
                    idea(
                        'retained',
                        'ready',
                        '[Still referenced](../../tickets/closed/0001-ticket-0001.md)\n',
                    ),
                )) {
                    await write(root, path, content);
                }
                await Deno.writeTextFile(
                    join(root, '.coderail/tickets/closed/0001-ticket-0001.md'),
                    'More detail\n',
                    { append: true },
                );
                const actual = await selectArchive(root, signal);
                expect(actual.eligible[0]?.tickets).toEqual([
                    '.coderail/tickets/closed/0002-ticket-0002.md',
                ]);
                expect(actual.deferred[0]?.reasons).toEqual([
                    'Referenced by retained Markdown: .coderail/plans/retained/IDEA.md.',
                ]);
            },
        );
    },
);

Deno.test('preview diagnoses an unborn HEAD and invalid Coderail layout', async () => {
    const root = await Deno.makeTempDir();
    const coderail = join(root, '.coderail');
    try {
        await expect(selectArchive(root, signal)).rejects.toThrow('Expected a regular directory');
        await Deno.writeTextFile(coderail, '');
        await expect(selectArchive(root, signal)).rejects.toThrow(coderail);
        await Deno.remove(coderail);
        await Deno.mkdir(coderail);
        await git(root, 'init', '-q');
        await expect(selectArchive(root, signal)).rejects.toThrow('Git rev-parse failed');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('preview reports unknown referenced tickets and invalid ticket metadata', async () => {
    await withProject(
        {
            ...ticket('0001', 'closed', 'dependencies: ["0002"]\n'),
        },
        async (root) => {
            await expect(selectArchive(root, signal)).rejects.toThrow('missing ticket "0002"');
            await write(root, '.coderail/tickets/open/0002-ticket-0002.md', 'Broken');
            await expect(selectArchive(root, signal)).rejects.toThrow('Invalid ticket id');
        },
    );
});

Deno.test(
    'preview detects deleted plans and tickets but allows a ticket reopened by ID',
    async () => {
        await withProject(
            {
                ...ticket('0001', 'closed'),
                ...idea('legacy', 'archived'),
                ...idea('unrelated', 'open'),
                '.coderail/plans/unrecognized/IDEA.md':
                    '---\ntitle: "Unknown"\nstatus: "unused"\n---\n',
            },
            async (root) => {
                const closed = '.coderail/tickets/closed/0001-ticket-0001.md';
                await Deno.remove(join(root, '.coderail/plans/unrecognized/IDEA.md'));
                await Deno.remove(join(root, closed));
                await expect(selectArchive(root, signal)).rejects.toThrow(
                    'Archive source ticket is missing',
                );
                for (const [path, text] of Object.entries(ticket('0001', 'open'))) {
                    await write(root, path, text);
                }
                await Deno.remove(join(root, '.coderail/plans/unrelated/IDEA.md'));
                expect((await selectArchive(root, signal)).eligible).toHaveLength(1);
                await Deno.remove(join(root, '.coderail/plans/legacy/IDEA.md'));
                await expect(selectArchive(root, signal)).rejects.toThrow(
                    'Archive source plan is missing',
                );
            },
        );
    },
);

Deno.test(
    'preview reports invalid UTF-8 and exact invalid plan paths as scan failures',
    async () => {
        await withProject(
            {
                ...idea('legacy', 'archived'),
                '.coderail/plans/legacy/file.txt': 'Not a directory',
                '.coderail/plans/references.md': '',
            },
            async (root) => {
                const reference = '.coderail/plans/references.md';
                await Deno.writeFile(join(root, reference), Uint8Array.of(0xff));
                await expect(selectArchive(root, signal)).rejects.toThrow(
                    'Cannot inspect plan links',
                );
                await write(root, reference, '[Broken](legacy/file.txt/no.md)\n');
                await expect(selectArchive(root, signal)).rejects.toThrow('Stale archive link');

                await Deno.symlink('legacy/file.txt', join(root, '.coderail/plans/alias.txt'));
                await write(root, reference, '[Symlink](alias.txt)\n');
                await expect(selectArchive(root, signal)).rejects.toThrow('Stale archive link');
                await write(root, reference, '[Directory](legacy/)\n');
                const { deferred, eligible } = await selectArchive(root, signal);
                expect(eligible).toEqual([]);
                expect(deferred[0]?.reasons).toEqual([
                    'Referenced by retained Markdown: .coderail/plans/references.md.',
                ]);
            },
        );
    },
);

Deno.test(
    'preview validates executable bits, rejects symlinks, and surfaces file access failures',
    async () => {
        await withProject(
            {
                ...idea('legacy', 'archived'),
                [artifact]: 'original',
                '.coderail/plans/guide.md': '[Check](legacy/nested/data.txt)',
            },
            async (root) => {
                const candidate = join(root, artifact);
                const guide = join(root, '.coderail/plans/guide.md');
                await Deno.writeTextFile(guide, 'No retained links.');

                const lstat = Deno.lstat;
                const realPath = Deno.realPath;
                try {
                    Deno.lstat = (path) =>
                        String(path) === candidate
                            ? Promise.reject(
                                  new Deno.errors.PermissionDenied('Unreadable artifact'),
                              )
                            : lstat(path);
                    await expect(selectArchive(root, signal)).rejects.toThrow(
                        'Unreadable artifact',
                    );
                    await Deno.writeTextFile(guide, '[Check](legacy/nested/data.txt)');
                    await expect(selectArchive(root, signal)).rejects.toThrow(
                        'Unreadable artifact',
                    );
                    Deno.lstat = lstat;
                    Deno.realPath = (path) =>
                        String(path) === candidate
                            ? Promise.resolve(candidate + '-alternate')
                            : realPath(path);
                    await expect(selectArchive(root, signal)).rejects.toThrow('Stale archive link');
                    await Deno.writeTextFile(guide, 'No retained links.');
                    await expect(selectArchive(root, signal)).rejects.toThrow(
                        'Archive source is not a regular file',
                    );
                } finally {
                    Deno.lstat = lstat;
                    Deno.realPath = realPath;
                }

                await Deno.chmod(candidate, 0o755);
                await expect(selectArchive(root, signal)).rejects.toThrow(
                    'differs in the working tree',
                );
                await git(root, 'add', artifact);
                await expect(selectArchive(root, signal)).rejects.toThrow('differs in the index');
                await git(root, 'commit', '--no-gpg-sign', '-qm', 'Executable artifact');
                expect((await selectArchive(root, signal)).eligible).toHaveLength(1);
                if (Deno.build.os !== 'windows') {
                    await Deno.remove(candidate);
                    await Deno.symlink('../IDEA.md', candidate);
                    await git(root, 'add', artifact);
                    await git(root, 'commit', '--no-gpg-sign', '-qm', 'Symlink artifact');
                    await expect(selectArchive(root, signal)).rejects.toThrow(
                        'Archive source is not a regular file',
                    );
                    await Deno.remove(candidate);
                    await Deno.writeTextFile(candidate, 'Now a regular file');
                    await expect(selectArchive(root, signal)).rejects.toThrow(
                        'Archive source is not a regular file',
                    );
                }
            },
        );
    },
);

Deno.test('preview handles a path with unavailable mode and an index conflict', async () => {
    await withProject(
        {
            ...idea('legacy', 'archived'),
            [artifact]: 'original',
        },
        async (root) => {
            const path = join(root, artifact);
            const lstat = Deno.lstat;
            try {
                Deno.lstat = async (input) => {
                    const info = await lstat(input);
                    return input === path ? { ...info, mode: null } : info;
                };
                expect((await selectArchive(root, signal)).eligible).toHaveLength(1);
            } finally {
                Deno.lstat = lstat;
            }

            const original = await git(root, 'rev-parse', `HEAD:${artifact}`);
            const command = new Deno.Command('git', {
                cwd: root,
                args: ['update-index', '--index-info'],
                stdin: 'piped',
            }).spawn();
            const input = command.stdin.getWriter();
            const text = `0 ${'0'.repeat(original.length)}\t${artifact}\n100644 ${original} 1\t${artifact}\n`;
            await input.write(new TextEncoder().encode(text));
            await input.close();
            expect((await command.status).code).toBe(0);
            await expect(selectArchive(root, signal)).rejects.toThrow('differs in the index');
        },
    );
});
