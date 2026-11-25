import { Fs } from '@fs';
import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { dirname, fromFileUrl, join } from '@std/path';
import { scanTicketLinks, type TicketLinkTarget, updateTicketLinks } from '@tickets';

import { inspectDocumentTicketLinks, inspectMarkdownLinks } from '../../src/tickets/plan-links.ts';

const signal = new AbortController().signal;

async function workspace(
    run: (root: string, target: TicketLinkTarget) => Promise<void>,
): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        await run(root, {
            id: '0055',
            slug: 'update-links',
            path: join(root, '.coderail', 'tickets', 'closed', '0055-update-links.md'),
        });
    } finally {
        await Fs.cleanup();
        await Deno.remove(root, { recursive: true });
    }
}

async function put(root: string, filename: string, content: string): Promise<string> {
    const path = join(root, '.coderail', filename);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, content);
    return path;
}

function link(status: string, ticket = '0055-update-links', depth = '..'): string {
    return `${depth}/tickets/${status}/${ticket}.md`;
}

async function documentLock(root: string, filename: string): Promise<string> {
    const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`.coderail/plans/${filename}`),
    );
    return join(root, '.coderail', '.locks', 'markdown', `${new Uint8Array(hash).toHex()}.lock`);
}

Deno.test(
    'Shared link inspection discovers ticket and artifact links across Coderail',
    async () => {
        await workspace(async (root, target) => {
            const ticketDestination = link('closed') + '#details';
            const artifactDestination = '../plans/legacy/assets/map.png?raw=1';
            const directoryDestination = '../plans/legacy/assets%2F?view=all';
            const content = [
                `[Details](${ticketDestination})`,
                `![Map](${artifactDestination})`,
                `[Assets](${directoryDestination})`,
                '[Outside](../../plans/file.md)',
                '[External](https://example.test/.coderail/plans/file.md)',
                '[Fragment](#details)',
            ].join('\n');
            const document = await put(root, 'notes/overview.md', content);
            await put(root, 'notes/ignored.txt', `[Ignored](${ticketDestination})`);
            const links: unknown[] = [];
            const warnings = await inspectMarkdownLinks(
                root,
                '.',
                ['tickets', 'plans'],
                signal,
                (link) => {
                    links.push({
                        document: link.document,
                        path: link.path,
                        source: content.slice(link.start, link.end),
                        suffix: link.destination.slice(link.suffix),
                        requiresDirectory: link.requiresDirectory,
                    });
                },
            );
            expect(warnings).toEqual([]);
            expect(links).toEqual([
                {
                    document,
                    path: target.path,
                    source: ticketDestination,
                    suffix: '#details',
                    requiresDirectory: false,
                },
                {
                    document,
                    path: join(root, '.coderail', 'plans', 'legacy', 'assets', 'map.png'),
                    source: artifactDestination,
                    suffix: '?raw=1',
                    requiresDirectory: false,
                },
                {
                    document,
                    path: join(root, '.coderail', 'plans', 'legacy', 'assets'),
                    source: directoryDestination,
                    suffix: '?view=all',
                    requiresDirectory: true,
                },
            ]);
        });
    },
);

Deno.test(
    'Plan link inspection reports eligible identities in one shared Markdown scan',
    async () => {
        await workspace(async (root, target) => {
            const open = link('open');
            const unresolved = link('closed', '0063-missing-ticket');
            const doc = await put(
                root,
                'plans/overview.md',
                [
                    `[current](${link('closed')}#section)`,
                    `[stale](${open})`,
                    '',
                    `[unresolved]: <${unresolved}>`,
                    '',
                    '[malformed](../tickets/open/not-a-ticket.md)',
                    `![image](${open})`,
                    `\`[code](${open})\``,
                    '[other](../../outside/open/0055-update-links.md)',
                ].join('\n'),
            );
            const mentions: unknown[] = [];
            expect(
                await inspectDocumentTicketLinks(root, 'plan', signal, (mention) =>
                    mentions.push(mention),
                ),
            ).toEqual([]);
            expect(mentions).toEqual([
                {
                    document: doc,
                    id: '0055',
                    slug: 'update-links',
                    destination: link('closed') + '#section',
                    requiresDirectory: false,
                    ticketPath: join('.coderail', 'tickets', 'closed', '0055-update-links.md'),
                },
                {
                    document: doc,
                    id: '0055',
                    slug: 'update-links',
                    destination: open,
                    requiresDirectory: false,
                    ticketPath: join('.coderail', 'tickets', 'open', '0055-update-links.md'),
                },
                {
                    document: doc,
                    id: '0063',
                    slug: 'missing-ticket',
                    destination: unresolved,
                    requiresDirectory: false,
                    ticketPath: join('.coderail', 'tickets', 'closed', '0063-missing-ticket.md'),
                },
            ]);
            if (Deno.build.os !== 'windows') {
                const absolute = join(root, '.coderail', 'tickets', 'open', '0055-update-links.md');
                const original = await Deno.readTextFile(doc);
                await Deno.writeTextFile(doc, `[absolute](${absolute}?view=plain#section)`);
                const destinations: string[] = [];
                await inspectDocumentTicketLinks(root, 'plan', signal, ({ destination }) =>
                    destinations.push(destination),
                );
                expect(destinations).toEqual([`${open}?view=plain#section`]);
                await Deno.writeTextFile(doc, original);
            }
            const scan = await scanTicketLinks(root, target, signal);
            expect(scan.findings).toEqual([
                { path: doc, destination: open, expectedDestination: link('closed') },
            ]);
        });
    },
);

Deno.test(
    'Plan scan covers Markdown destinations and preserves all bytes outside edits',
    async () => {
        await workspace(async (root, target) => {
            const open = link('open', undefined, '../..');
            const active = link('active', undefined, '../..');
            const closed = link('closed', undefined, '../..');
            const nestedCase = join('plans', 'archived', 'IDEA.MD');
            const untouched = [
                `Escaped \\[escaped](${open}); escaped reference [nope].`,
                `Inline \`[code](${open})\` and \`\` [code](${open}) \`\`.`,
                `![image](${open})`,
                `[website](https://example.com/${open}) [network](//host/${open}) [scheme](mailto:${open})`,
                `[encoded scheme](https&colon;//example.com/${open}) [bad encoding](${open.replace('0055', '%55%Q1')})`,
                `[outside](../../tickets-elsewhere/open/0055-update-links.md) [elsewhere](../../../other/0055-update-links.md)`,
                `[different id](${link('open', '0056-update-links', '../..')}) [different slug](${link('open', '0055-update-links-extra', '../..')})`,
                open,
                '',
                '```markdown',
                `[fenced](${open})`,
                '```',
                '',
                `    [indent](${open})`,
                '',
                '> ~~~',
                `> [quoted fence](${open})`,
                '> ~~~',
                '',
            ];
            const sections: [string, string][] = [
                ['\uFEFF---', '\uFEFF---'],
                [`title: "[metadata](${open})"`, `title: "[metadata](${open})"`],
                ['status: archived', 'status: archived'],
                ['---', '---'],
                ['', ''],
                [
                    `✨ [a [nested] label](<${open}#here> "T \\"quoted\\"")  `,
                    `✨ [a [nested] label](<${closed}#here> "T \\"quoted\\"")  `,
                ],
                [
                    `[b](${active.replace('update-links', 'update&#45;links')}&#35;section 't')`,
                    `[b](${closed}&#35;section 't')`,
                ],
                [
                    `[c](${open.replace('update-links', '%75pdate-links')}?view=1#c)`,
                    `[c](${closed}?view=1#c)`,
                ],
                [`[current](./${closed})`, `[current](./${closed})`],
                ...untouched.map((line): [string, string] => [line, line]),
                [
                    `[ref]:\t<${active}#r> (reference title)`,
                    `[ref]:\t<${closed}#r> (reference title)`,
                ],
            ];
            const doc = await put(
                root,
                nestedCase,
                sections.map(([before]) => before).join('\r\n'),
            );
            const helper = await put(root, 'plans/comments.md', `[helper](${link('open')})\n`);
            const nonMarkdown = await put(root, 'plans/ignored.txt', `[ignore](${link('open')})`);
            const cwdAlias = join(root, 'alias');
            await Deno.symlink(root, cwdAlias, { type: 'dir' });
            const aliasTarget = {
                ...target,
                path: join(cwdAlias, '.coderail', 'tickets', 'closed', '0055-update-links.md'),
            };
            const scan = await scanTicketLinks(cwdAlias, aliasTarget, signal);

            expect(scan.files.sort()).toEqual([doc, helper].sort());
            expect(scan.warnings).toEqual([]);
            expect(scan.findings.filter(({ path }) => path === doc)).toEqual([
                { path: doc, destination: open + '#here', expectedDestination: closed + '#here' },
                {
                    path: doc,
                    destination:
                        active.replace('update-links', 'update&#45;links') + '&#35;section',
                    expectedDestination: closed + '&#35;section',
                },
                {
                    path: doc,
                    destination: open.replace('update-links', '%75pdate-links') + '?view=1#c',
                    expectedDestination: closed + '?view=1#c',
                },
                { path: doc, destination: active + '#r', expectedDestination: closed + '#r' },
            ]);
            expect(await updateTicketLinks(root, target, scan, signal)).toEqual([]);
            expect(await Deno.readFile(doc)).toEqual(
                new TextEncoder().encode(sections.map(([, after]) => after).join('\r\n')),
            );
            expect(await Deno.readTextFile(helper)).toBe(`[helper](${link('closed')})\n`);
            expect(await Deno.readTextFile(nonMarkdown)).toBe(`[ignore](${link('open')})`);
            const current = await scanTicketLinks(root, target, signal);
            expect({ ...current, files: current.files.sort() }).toEqual({
                files: [doc, helper].sort(),
                findings: [],
                warnings: [],
            });
        });
    },
);

Deno.test(
    'Plan links preserve encoded fragments and escape replacement path characters',
    async () => {
        await workspace(async (root, target) => {
            const name = '0055-café (draft)';
            const before =
                '\uFEFF---\n[old](<../tickets/open/0055-caf%C3%A9%20(draft).md\\#a>)\n---';
            const expected =
                '\uFEFF---\n[old](<../tickets/closed/0055-caf%C3%A9%20%28draft%29.md\\#a>)\n---';
            const doc = await put(root, 'plans/unusual.md', before);
            const destination = {
                ...target,
                slug: 'café (draft)',
                path: join(root, '.coderail', 'tickets', 'closed', name + '.md'),
            };
            const scan = await scanTicketLinks(root, destination, signal);
            expect(scan.files).toEqual([doc]);
            expect(await updateTicketLinks(root, destination, scan, signal)).toEqual([]);
            expect(await Deno.readFile(doc)).toEqual(new TextEncoder().encode(expected));
        });
    },
);

Deno.test(
    'Plan scan tolerates absent plans and skips symlinked files and directories',
    async () => {
        await workspace(async (root, target) => {
            const empty = await scanTicketLinks(root, target, signal);
            expect(empty).toEqual({
                files: [],
                findings: [],
                warnings: [],
            });
            expect(await updateTicketLinks(root, target, empty, signal)).toEqual([]);
            const outside = await put(root, 'outside/plan.md', `[out](${link('open')})`);
            const plans = join(root, '.coderail', 'plans');
            await Deno.symlink(dirname(outside), plans, { type: 'dir' });
            const badRoot = await scanTicketLinks(root, target, signal);
            expect(badRoot.files).toEqual([]);
            expect(badRoot.warnings).toEqual([
                { path: plans, message: expect.stringContaining('resolves outside') },
            ]);
            await Deno.remove(plans);
            await Deno.mkdir(plans);
            await Deno.symlink(outside, join(plans, 'outside.md'));
            await Deno.symlink(dirname(outside), join(plans, 'outdir'), { type: 'dir' });
            const good = await put(root, 'plans/real.md', `[real](${link('open')})`);
            const scan = await scanTicketLinks(root, target, signal);
            expect(scan.files).toEqual([good]);
            expect(scan.warnings).toEqual([]);
            expect(await updateTicketLinks(root, target, scan, signal)).toEqual([]);
            expect(await Deno.readTextFile(outside)).toBe(`[out](${link('open')})`);
            const metadata = join(root, '.coderail');
            const renamed = join(root, 'metadata');
            await Deno.rename(metadata, renamed);
            await Deno.symlink(renamed, metadata, { type: 'dir' });
            expect(await scanTicketLinks(root, target, signal)).toEqual({
                files: [],
                findings: [],
                warnings: [{ path: plans, message: expect.stringContaining('resolves outside') }],
            });
        });
    },
);

Deno.test(
    'Plan scan warns for inaccessible documents and directories, then keeps scanning',
    async () => {
        await workspace(async (root, target) => {
            const unreadable = await put(root, 'plans/unreadable.md', '');
            const blocked = dirname(await put(root, 'plans/inaccessible/ignored.md', ''));
            const readable = await put(root, 'plans/readable.md', `[ticket](${link('open')})`);
            const originalReadDir = Deno.readDir;
            const originalReadFile = Deno.readFile;
            Deno.readDir = (path) => {
                if (path === blocked) {
                    throw new Deno.errors.PermissionDenied('directory inspection denied');
                }
                return originalReadDir(path);
            };
            Deno.readFile = (path, options) =>
                path === unreadable
                    ? Promise.reject(new Deno.errors.PermissionDenied('document inspection denied'))
                    : originalReadFile(path, options);
            try {
                const scan = await scanTicketLinks(root, target, signal);
                expect(scan.files).toEqual([readable]);
                expect(scan.warnings).toEqual(
                    expect.arrayContaining([
                        {
                            path: unreadable,
                            message: expect.stringContaining('document inspection denied'),
                        },
                        {
                            path: blocked,
                            message: expect.stringContaining('directory inspection denied'),
                        },
                    ]),
                );
                expect(scan.warnings).toHaveLength(2);
            } finally {
                Deno.readDir = originalReadDir;
                Deno.readFile = originalReadFile;
            }
        });
    },
);

Deno.test(
    'Plan update rereads after acquiring the same document lock across replacement',
    async () => {
        await workspace(async (root, target) => {
            const before = `[ours](${link('open')}) [other](${link('open', '0056-other')})`;
            const doc = await put(root, 'plans/Shared.md', before);
            const scan = await scanTicketLinks(root, target, signal);
            expect(scan.files).toEqual([doc]);
            const path = await documentLock(root, 'Shared.md');
            await Deno.mkdir(dirname(path), { recursive: true });
            const holder = await Fs.makeTempFile(path);
            const attempted = Promise.withResolvers<string>();
            const initial = Fs.makeTempFile;
            Fs.makeTempFile = (lockPath) => {
                attempted.resolve(lockPath);
                return initial(lockPath);
            };
            const result = updateTicketLinks(root, target, scan, signal);
            try {
                const first = await Promise.race([attempted.promise, result]);
                expect(first).toBe(path);
                const replacement = `[ours](${link('open')}) [other](${link('active', '0056-other')}) altered`;
                await Fs.write(doc, ReadableStream.from([replacement]));
                expect(await Deno.readTextFile(path)).toBe('');
                await holder.remove();
                expect(await result).toEqual([]);
                expect(await Fs.exists(path)).toBe(false);
                expect(await Deno.readTextFile(doc)).toBe(
                    replacement.replace(link('open'), link('closed')),
                );
            } finally {
                Fs.makeTempFile = initial;
                await holder.remove();
                await result.catch(() => undefined);
            }
        });
    },
);

Deno.test(
    'Plan update only writes stale links and preserves later files after independent failures',
    async () => {
        await workspace(async (root, target) => {
            const old = `[ticket](${link('open')})`;
            const current = `[ticket](${link('closed')})`;
            const blockedWrite = await put(root, 'plans/a-write.md', old);
            await put(root, 'plans/.~a-write.md.lock', 'external holder');
            const blockedLock = await put(root, 'plans/b-lock.md', old);
            const lock = await documentLock(root, 'b-lock.md');
            await Deno.mkdir(dirname(lock), { recursive: true });
            await Deno.writeTextFile(lock, 'external holder');
            const replaced = await put(root, 'plans/c-replaced.md', old);
            const nested = `[ticket](${link('open', undefined, '../..')})`;
            const redirected = await put(root, 'plans/c-subdirectory/nested.md', nested);
            const vanished = await put(root, 'plans/d-vanished.md', old);
            const stillCurrent = await put(root, 'plans/e-current.md', current);
            const readable = await put(root, 'plans/f-independent.md', old);

            const scan = await scanTicketLinks(root, target, signal);
            expect(scan.files.sort()).toEqual([
                blockedWrite,
                blockedLock,
                replaced,
                redirected,
                vanished,
                stillCurrent,
                readable,
            ]);
            expect(scan.findings.some(({ path }) => path === stillCurrent)).toBe(false);
            const outside = await put(root, 'outside.md', old);
            const outsideNested = await put(root, 'outside/nested.md', nested);
            await Deno.remove(replaced);
            await Deno.symlink(outside, replaced);
            await Deno.remove(dirname(redirected), { recursive: true });
            await Deno.symlink(dirname(outsideNested), dirname(redirected), { type: 'dir' });
            await Deno.remove(vanished);
            await put(root, 'plans/.~e-current.md.lock', 'untouched staging');
            const oldSetTimeout = globalThis.setTimeout;
            const oldNow = performance.now;
            let now = 0;
            performance.now = () => now;
            globalThis.setTimeout = ((callback: () => void, ms: number) => {
                if (ms === 100) {
                    now += 30_000;
                }
                return oldSetTimeout(callback, 0);
            }) as typeof setTimeout;
            try {
                const warnings = await updateTicketLinks(root, target, scan, signal);
                expect(warnings).toEqual([
                    { path: blockedWrite, message: expect.stringContaining('File exists') },
                    {
                        path: blockedLock,
                        message: expect.stringContaining(
                            `plan document ${blockedLock} at ${lock}: Timed out after 30000 ms`,
                        ),
                    },
                    { path: replaced, message: expect.stringContaining('regular Markdown file') },
                    { path: redirected, message: expect.stringContaining('regular Markdown file') },
                    { path: vanished, message: expect.stringContaining('No such file') },
                ]);
            } finally {
                performance.now = oldNow;
                globalThis.setTimeout = oldSetTimeout;
            }
            expect(await Deno.readTextFile(blockedWrite)).toBe(old);
            expect(await Deno.readTextFile(lock)).toBe('external holder');
            expect(await Fs.exists(await documentLock(root, 'a-write.md'))).toBe(false);
            expect(await Deno.readTextFile(outside)).toBe(old);
            expect(await Deno.readTextFile(outsideNested)).toBe(nested);
            expect(await Deno.readTextFile(stillCurrent)).toBe(current);
            expect(await Deno.readTextFile(readable)).toBe(current);
        });
    },
);

Deno.test('Plan update releases its document lock and stops on cancellation', async () => {
    await workspace(async (root, target) => {
        const old = `[ticket](${link('active')})`;
        const blocked = await put(root, 'plans/blocked.md', old);
        await put(root, 'plans/.~blocked.md.lock', 'external holder');
        const first = await put(root, 'plans/first.md', old);
        const later = await put(root, 'plans/later.md', old);
        const scan = await scanTicketLinks(root, target, signal);
        scan.files.sort();
        const controller = new AbortController();
        const originalReadFile = Deno.readFile;
        const failure = new Error('cancel plan update');
        const lock = await documentLock(root, 'first.md');
        Deno.readFile = async (path, options) => {
            if (path === first) {
                expect(await Fs.exists(lock)).toBe(true);
                controller.abort(failure);
            }
            return originalReadFile(path, options);
        };
        try {
            expect(await updateTicketLinks(root, target, scan, controller.signal)).toEqual([
                { path: blocked, message: expect.stringContaining('File exists') },
                { path: first, message: 'Plan link maintenance interrupted: cancel plan update' },
                { path: later, message: 'Plan link maintenance interrupted: cancel plan update' },
            ]);
            await expect(scanTicketLinks(root, target, controller.signal)).rejects.toBe(failure);
        } finally {
            Deno.readFile = originalReadFile;
        }
        expect(await Fs.exists(lock)).toBe(false);
        expect(await Deno.readTextFile(blocked)).toBe(old);
        expect(await Deno.readTextFile(first)).toBe(old);
        expect(await Deno.readTextFile(later)).toBe(old);
    });
});

function ticketCli(root: string, args: string[], preload?: string): Deno.Command {
    return new Deno.Command(Deno.execPath(), {
        args: [
            'run',
            '--cached-only',
            '-A',
            ...(preload === undefined ? [] : ['--preload', preload]),
            '--config',
            fromFileUrl(new URL('../../deno.json', import.meta.url)),
            fromFileUrl(new URL('../../src/main.ts', import.meta.url)),
            '--cwd',
            root,
            '--no-color',
            'ticket',
            ...args,
        ],
        env: { NO_COLOR: '1', LOG_LEVEL: 'normal' },
        stdout: 'piped',
        stderr: 'piped',
    });
}

async function initialize(root: string): Promise<void> {
    await put(root, '.gitignore', ['*', ...projectIgnoreLines, ''].join('\n'));
    for (const id of ['0055', '0056']) {
        await put(
            root,
            `tickets/open/${id}-update-links.md`,
            '---\ntitle: Fixture\nstatus: open\n---\n',
        );
    }
}

function outputText(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes).replaceAll('\x1b[0K', '').trim();
}

Deno.test('Concurrent CLI transitions preserve both changes to a shared plan', async () => {
    await workspace(async (root) => {
        await initialize(root);
        const doc = await put(
            root,
            'plans/shared.md',
            `[one](${link('open')}) [two](${link('open', '0056-update-links')})`,
        );
        const path = await documentLock(root, 'shared.md');
        await Deno.mkdir(dirname(path), { recursive: true });
        const holder = await Fs.makeTempFile(path);
        let finishedEarly = false;
        const runs = [
            ticketCli(root, ['close', '--json', '0055']),
            ticketCli(root, ['activate', '--json', '0056']),
        ].map(async (command) => {
            const result = await command.output();
            finishedEarly = true;
            return result;
        });
        let results: Deno.CommandOutput[];
        try {
            // The holder makes both processes discover the same old document before either writes.
            const deadline = performance.now() + 5_000;
            while (
                !(await Fs.exists(
                    join(root, '.coderail', 'tickets', 'closed', '0055-update-links.md'),
                )) ||
                !(await Fs.exists(
                    join(root, '.coderail', 'tickets', 'active', '0056-update-links.md'),
                ))
            ) {
                if (finishedEarly || performance.now() >= deadline) {
                    throw new Error('Concurrent transitions did not reach the document lock');
                }
                await new Promise((settle) => setTimeout(settle, 20));
            }
        } finally {
            await holder.remove();
            results = await Promise.all(runs);
        }
        for (const result of results) {
            expect(result.code, outputText(result.stderr)).toBe(0);
            expect(outputText(result.stderr)).toBe('');
        }
        expect(await Fs.exists(path)).toBe(false);
        expect(await Deno.readTextFile(doc)).toBe(
            `[one](${link('closed')}) [two](${link('active', '0056-update-links')})`,
        );
    });
});

Deno.test(
    'Successful CLI transition reports incomplete maintenance on stderr without changing JSON',
    async () => {
        await workspace(async (root, target) => {
            await initialize(root);
            const blocked = await put(root, 'plans/blocked.md', `[blocked](${link('open')})`);
            await put(root, 'plans/.~blocked.md.lock', 'occupied');
            const unreadable = await put(root, 'plans/invalid.md', '');
            await Deno.writeFile(unreadable, new Uint8Array([0xff]));
            const good = await put(root, 'plans/good.md', `[good](${link('open')})`);
            const result = await ticketCli(root, ['close', '--json', '0055']).output();
            const stderr = outputText(result.stderr);
            expect(result.code, stderr).toBe(0);
            expect(stderr).toContain(`${blocked}: Cannot update plan links: File exists`);
            expect(stderr).toContain(`${unreadable}: Cannot inspect plan links`);
            expect(JSON.parse(outputText(result.stdout))).toEqual([
                {
                    ...target,
                    title: 'Fixture',
                    dependencies: [],
                    status: 'closed',
                    reason: 'done',
                },
            ]);
            expect(await Deno.readTextFile(blocked)).toBe(`[blocked](${link('open')})`);
            expect(await Deno.readTextFile(good)).toBe(`[good](${link('closed')})`);
        });
    },
);

Deno.test(
    'Interrupting CLI plan maintenance preserves the completed transition result',
    async () => {
        await workspace(async (root, target) => {
            await initialize(root);
            const content = `[pending](${link('open')})`;
            const doc = await put(root, 'plans/pending.md', content);
            const lock = await documentLock(root, 'pending.md');
            const preload = await put(
                root,
                'interrupt.ts',
                `
            let interrupt;
            const addSignalListener = Deno.addSignalListener;
            Deno.addSignalListener = (signal, handler) => {
                if (signal === 'SIGINT') {
                    interrupt = handler;
                }
                addSignalListener(signal, handler);
            };
            const readFile = Deno.readFile;
            let reads = 0;
            Deno.readFile = (path, options) => {
                if (path === ${JSON.stringify(doc)} && ++reads === 2) {
                    Deno.statSync(${JSON.stringify(lock)});
                    interrupt();
                }
                return readFile(path, options);
            };
        `,
            );
            const result = await ticketCli(root, ['close', '--json', '0055'], preload).output();
            const stderr = outputText(result.stderr);
            expect(result.code, stderr).toBe(0);
            expect(stderr).toContain(`${doc}: Plan link maintenance interrupted`);
            expect(JSON.parse(outputText(result.stdout))).toEqual([
                {
                    ...target,
                    title: 'Fixture',
                    dependencies: [],
                    status: 'closed',
                    reason: 'done',
                },
            ]);
            expect(await Fs.exists(join(root, '.coderail', '.locks', 'tickets', '0055.lock'))).toBe(
                false,
            );
            expect(await Fs.exists(lock)).toBe(false);
            expect(await Deno.readTextFile(doc)).toBe(content);
        });
    },
);
