import { expect } from '@std/expect';
import { fromFileUrl, join } from '@std/path';

import { prepareRelease } from '../../tools/ship.ts';

const entrypoint = fromFileUrl(new URL('../../tools/ship.ts', import.meta.url));
const versionPath = 'src/cli/version.ts';
const versionSource = "export const CODERAIL_VERSION = '0.1.0';\n";
const base = 'https://github.com/pavelmudroch/coderail';
const entries = '### Added\n\n- Keep this [link](https://example.com).\n';
const initial = `# Changelog\n\n## [Unreleased]\n\n${entries}\n[Unreleased]: ${base}\n`;
const date = new Date('2026-11-05T23:59:59Z');

Deno.test('ship prepares semver bumps, resets components, and rejects invalid versions', () => {
    for (const [current, bump, next] of [
        ['0.1.0', 'major', '1.0.0'],
        ['0.1.0', 'minor', '0.2.0'],
        ['0.1.0', 'patch', '0.1.1'],
        ['12.34.56', 'major', '13.0.0'],
        ['12.34.56', 'minor', '12.35.0'],
        ['12.34.56', 'patch', '12.34.57'],
    ] as const) {
        const result = prepareRelease(versionSource.replace('0.1.0', current), initial, bump, date);
        expect(result.version).toBe(next);
        expect(result.versionSource).toBe(versionSource.replace('0.1.0', next));
    }
    for (const current of [
        '01.1.0',
        '1.2',
        'v1.2.3',
        '1.2.3-beta',
        '-1.2.3',
        '9007199254740991.0.0',
    ]) {
        expect(() =>
            prepareRelease(versionSource.replace('0.1.0', current), initial, 'major', date),
        ).toThrow('version');
    }
    expect(() => prepareRelease('missing declaration', initial, 'patch', date)).toThrow('version');
});

Deno.test(
    'ship preserves entries and history with UTC dates and first/subsequent release links',
    () => {
        const first = prepareRelease(versionSource, initial, 'patch', date);
        expect(first.changelog).toBe(
            `# Changelog\n\n## [Unreleased]\n\n## [0.1.1] - 2026-11-05\n\n${entries}\n` +
                `[Unreleased]: ${base}/compare/v0.1.1...HEAD\n` +
                `[0.1.1]: ${base}/releases/tag/v0.1.1\n`,
        );
        const historical = first.changelog.replace(
            '## [Unreleased]\n\n',
            '## [Unreleased]\n\n- Next\n\n',
        );
        expect(prepareRelease(first.versionSource, historical, 'patch', date).changelog).toBe(
            `# Changelog\n\n## [Unreleased]\n\n## [0.1.2] - 2026-11-05\n\n- Next\n\n` +
                `## [0.1.1] - 2026-11-05\n\n${entries}\n` +
                `[Unreleased]: ${base}/compare/v0.1.2...HEAD\n` +
                `[0.1.1]: ${base}/releases/tag/v0.1.1\n` +
                `[0.1.2]: ${base}/compare/v0.1.1...v0.1.2\n`,
        );
    },
);

Deno.test(
    'ship preserves an existing target section byte-for-byte and rejects empty release notes',
    () => {
        const existing = `# Changelog\r\n\r\n## [Unreleased]\r\n\r\n## [0.1.1] - 2000-01-01\r\n\r\n- Old\r\n\r\n[0.1.1]: custom\r\n`;
        const prepared = prepareRelease(versionSource, existing, 'patch', date);
        expect(prepared.changelog).toBe(existing);
        expect(prepared.versionSource).toBe(versionSource.replace('0.1.0', '0.1.1'));
        for (const content of ['', ' \n\t\n', '### Added\n\n### Fixed\n']) {
            expect(() =>
                prepareRelease(versionSource, initial.replace(entries, content), 'patch', date),
            ).toThrow('Unreleased');
        }
    },
);

Deno.test('ship preserves historical references when adding missing release links', () => {
    const history = '## [0.1.0] - 2000-01-01\n\n- History\n\n[custom]: untouched  \n\n';
    const changelog = `## [Unreleased]\n\n${entries}\n${history}`;
    expect(prepareRelease(versionSource, changelog, 'patch', date).changelog).toBe(
        `## [Unreleased]\n\n## [0.1.1] - 2026-11-05\n\n${entries}\n${history}\n` +
            `[Unreleased]: ${base}/compare/v0.1.1...HEAD\n` +
            `[0.1.1]: ${base}/compare/v0.1.0...v0.1.1\n`,
    );
    expect(() => prepareRelease(versionSource, history, 'patch', date)).toThrow('Unreleased');
});

Deno.test(
    'ship retains staged preparation or the release commit when local Git steps fail',
    async () => {
        for (const failure of ['commit', 'tag']) {
            await fixture(async (repo, origin) => {
                const head = await git(repo, 'rev-parse', 'HEAD');
                const remote = await git(origin, 'show-ref');
                const hook = failure === 'commit' ? 'pre-commit' : 'post-commit';
                const script = failure === 'commit' ? 'exit 1' : 'git tag v0.1.1 HEAD^';
                await Deno.writeTextFile(join(repo, '.git/hooks', hook), `#!/bin/sh\n${script}\n`, {
                    mode: 0o755,
                });
                const result = await ship(repo, 'patch');
                expect(result.code).toBe(1);
                expect(result.stderr).toContain(`release ${failure}`);
                expect(result.stderr).toContain('retained');
                expect(await Deno.readTextFile(join(repo, versionPath))).toBe(
                    versionSource.replace('0.1.0', '0.1.1'),
                );
                expect(await git(origin, 'show-ref')).toBe(remote);
                if (failure === 'commit') {
                    expect(await git(repo, 'rev-parse', 'HEAD')).toBe(head);
                    expect(await git(repo, 'tag')).toBe('');
                    expect(await git(repo, 'diff', '--cached', '--name-only')).toBe(
                        `CHANGELOG.md\n${versionPath}`,
                    );
                    expect(await git(repo, 'diff', '--name-only')).toBe('');
                } else {
                    expect(await git(repo, 'rev-parse', 'HEAD')).not.toBe(head);
                    expect(await git(repo, 'rev-parse', 'v0.1.1^{commit}')).toBe(head);
                    expect(await git(repo, 'status', '--porcelain')).toBe('');
                }
            });
        }
    },
);

Deno.test(
    'ship rejects invalid current versions before changing release files or refs',
    async () => {
        await fixture(async (repo, origin) => {
            await Deno.writeTextFile(
                join(repo, versionPath),
                versionSource.replace('0.1.0', '01.1.0'),
            );
            await git(repo, 'add', versionPath);
            await git(repo, 'commit', '-m', 'Invalid version fixture');
            await git(repo, 'push', 'origin', 'main');
            const before = await snapshot(repo, origin);
            for (const args of [['patch'], ['patch', '--dry']]) {
                const result = await ship(repo, ...args);
                expect(result.code).toBe(1);
                expect(result.stderr).toContain('version');
                expect(await snapshot(repo, origin)).toEqual(before);
            }
        });
    },
);

type Result = { code: number; stdout: string; stderr: string };

async function run(cwd: string, command: string, args: string[], env = {}): Promise<Result> {
    const output = await new Deno.Command(command, {
        cwd,
        args,
        env: {
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_TERMINAL_PROMPT: '0',
            ...env,
        },
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    const decoder = new TextDecoder();
    return {
        code: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
    };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await run(cwd, 'git', args);
    expect(result.code, result.stderr).toBe(0);
    return result.stdout.trim();
}

async function ship(cwd: string, ...args: string[]): Promise<Result> {
    return await run(cwd, Deno.execPath(), [
        'run',
        '--no-config',
        '--no-prompt',
        '--allow-read',
        '--allow-write',
        // Only Git may run: compilation, application tests, and packaging are forbidden.
        '--allow-run=git',
        entrypoint,
        ...args,
    ]);
}

async function fixture(
    action: (repo: string, origin: string, root: string) => Promise<void>,
    changelog = initial,
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'ship-test-' });
    try {
        const repo = join(root, 'work');
        const origin = join(root, 'origin.git');
        await git(root, 'init', '--bare', '--initial-branch=main', origin);
        await git(root, 'init', '--initial-branch=main', repo);
        await git(repo, 'config', 'user.name', 'Ship Test');
        await git(repo, 'config', 'user.email', 'ship@example.com');
        await Deno.mkdir(join(repo, 'src/cli'), { recursive: true });
        await Deno.writeTextFile(join(repo, versionPath), versionSource);
        await Deno.writeTextFile(join(repo, 'CHANGELOG.md'), changelog);
        await Deno.writeTextFile(join(repo, 'unrelated'), 'unchanged\n');
        await git(repo, 'add', '.');
        await git(repo, 'commit', '-m', 'Initial');
        await git(repo, 'remote', 'add', 'origin', origin);
        await git(repo, 'push', '-u', 'origin', 'main');
        await action(repo, origin, root);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

async function snapshot(repo: string, origin: string): Promise<unknown> {
    return {
        version: await Deno.readTextFile(join(repo, versionPath)),
        changelog: await Deno.readTextFile(join(repo, 'CHANGELOG.md')),
        refs: await git(repo, 'show-ref'),
        index: await git(repo, 'ls-files', '--stage'),
        status: await git(repo, 'status', '--porcelain'),
        remote: await git(origin, 'show-ref'),
    };
}

Deno.test('ship help and argument errors need no checkout, Git, network, or edits', async () => {
    const root = await Deno.makeTempDir();
    try {
        const help = await run(
            root,
            Deno.execPath(),
            ['run', '--no-config', '--no-prompt', entrypoint, '--help'],
            { PATH: '' },
        );
        expect(help.code, help.stderr).toBe(0);
        expect(help.stderr).toBe('');
        for (const word of [
            'major',
            'minor',
            'patch',
            '--dry',
            'unstaged',
            'commit',
            'tag',
            'push',
        ]) {
            expect(help.stdout).toContain(word);
        }
        for (const args of [
            [],
            ['patch', 'patch'],
            ['major', 'minor'],
            ['patch', 'extra'],
            ['--version'],
            ['patch', '--force'],
            ['--dry'],
            ['patch', '--dry', '--dry'],
            ['--help', 'patch'],
        ]) {
            const result = await ship(root, ...args);
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('Usage:');
        }
        expect(Array.from(Deno.readDirSync(root))).toEqual([]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('ship rejects Git preflight failures before release mutation', async () => {
    const cases: [string, (repo: string, origin: string) => Promise<unknown>][] = [
        ['main', (repo) => git(repo, 'checkout', '-b', 'topic')],
        ['clean', (repo) => Deno.writeTextFile(join(repo, 'unrelated'), 'dirty')],
        [
            'clean',
            async (repo) => {
                await Deno.writeTextFile(join(repo, 'unrelated'), 'staged');
                await git(repo, 'add', 'unrelated');
            },
        ],
        ['tracked', (repo) => git(repo, 'rm', '--cached', versionPath)],
        ['tracked', (repo) => git(repo, 'rm', '--cached', 'CHANGELOG.md')],
        [
            'synchronized',
            async (repo) => {
                await git(repo, 'commit', '--allow-empty', '-m', 'Unpushed');
            },
        ],
        ['fetch', (repo) => git(repo, 'remote', 'set-url', 'origin', '/nonexistent/ship-origin')],
        ['tag', (repo) => git(repo, 'tag', 'v0.1.1')],
        ['tag', (repo, origin) => git(origin, 'update-ref', 'refs/tags/v0.1.1', 'refs/heads/main')],
    ];
    for (const [message, setup] of cases) {
        await fixture(async (repo, origin) => {
            await setup(repo, origin);
            const before = await snapshot(repo, origin);
            const result = await ship(repo, 'patch');
            expect(result.code, result.stdout).toBe(1);
            expect(result.stderr).toContain(message);
            expect(await snapshot(repo, origin)).toEqual(before);
        });
    }
});

Deno.test('ship fetches before rejecting stale or diverged main without merging', async () => {
    for (const diverged of [false, true]) {
        await fixture(async (repo, origin, root) => {
            const peer = join(root, 'peer');
            await git(root, 'clone', origin, peer);
            await git(
                peer,
                '-c',
                'user.name=Peer',
                '-c',
                'user.email=peer@example.com',
                'commit',
                '--allow-empty',
                '-m',
                'Remote advance',
            );
            await git(peer, 'push', 'origin', 'main');
            if (diverged) {
                await git(repo, 'commit', '--allow-empty', '-m', 'Divergence');
            }
            const head = await git(repo, 'rev-parse', 'HEAD');
            const remote = await git(origin, 'show-ref');
            expect(await git(repo, 'rev-parse', 'origin/main')).not.toBe(
                await git(peer, 'rev-parse', 'HEAD'),
            );
            const result = await ship(repo, 'patch', '--dry');
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('synchronized');
            expect(await git(repo, 'rev-parse', 'origin/main')).toBe(
                await git(peer, 'rev-parse', 'HEAD'),
            );
            expect(await git(repo, 'rev-parse', 'HEAD')).toBe(head);
            expect(await git(repo, 'status', '--porcelain')).toBe('');
            expect(await git(origin, 'show-ref')).toBe(remote);
        });
    }
});

Deno.test(
    'ship prepares dry edits unstaged and normally commits, tags, and atomically pushes',
    async () => {
        for (const existing of [false, true]) {
            const changelog = existing
                ? '# Changelog\n\n## [Unreleased]\n\n## [0.1.1] - 2000-01-01\n\n- Authored\n\n[0.1.1]: custom\n'
                : initial;
            for (const dry of [true, false]) {
                await fixture(async (repo, origin) => {
                    const beforeHead = await git(repo, 'rev-parse', 'HEAD');
                    const beforeRemote = await git(origin, 'show-ref');
                    const beforeIndex = await git(repo, 'ls-files', '--stage');
                    const today = new Date();
                    const result = await ship(repo, ...(dry ? ['--dry', 'patch'] : ['patch']));
                    expect(result.code, result.stderr).toBe(0);
                    expect(await Deno.readTextFile(join(repo, versionPath))).toBe(
                        versionSource.replace('0.1.0', '0.1.1'),
                    );
                    expect(await Deno.readTextFile(join(repo, 'CHANGELOG.md'))).toBe(
                        prepareRelease(versionSource, changelog, 'patch', today).changelog,
                    );
                    expect(await Deno.readTextFile(join(repo, 'unrelated'))).toBe('unchanged\n');
                    if (dry) {
                        expect(await git(repo, 'rev-parse', 'HEAD')).toBe(beforeHead);
                        expect(await git(repo, 'tag')).toBe('');
                        expect(await git(repo, 'ls-files', '--stage')).toBe(beforeIndex);
                        expect(await git(origin, 'show-ref')).toBe(beforeRemote);
                        const prepared = await snapshot(repo, origin);
                        expect((await ship(repo, 'patch')).code).toBe(1);
                        expect(await snapshot(repo, origin)).toEqual(prepared);
                    } else {
                        const head = await git(repo, 'rev-parse', 'HEAD');
                        expect(await git(repo, 'rev-parse', 'HEAD^')).toBe(beforeHead);
                        expect(await git(repo, 'rev-parse', 'v0.1.1^{commit}')).toBe(head);
                        expect(await git(repo, 'cat-file', '-t', 'v0.1.1')).toBe('tag');
                        expect(await git(repo, 'tag', '-l', '--format=%(contents)', 'v0.1.1')).toBe(
                            'Release v0.1.1',
                        );
                        expect(await git(origin, 'rev-parse', 'main')).toBe(head);
                        expect(await git(origin, 'rev-parse', 'v0.1.1^{commit}')).toBe(head);
                        expect(await git(repo, 'status', '--porcelain')).toBe('');
                        expect(
                            (
                                await git(
                                    repo,
                                    'diff-tree',
                                    '--no-commit-id',
                                    '--name-only',
                                    '-r',
                                    'HEAD',
                                )
                            )
                                .split('\n')
                                .sort(),
                        ).toEqual(
                            (existing ? [versionPath] : ['CHANGELOG.md', versionPath]).sort(),
                        );
                    }
                }, changelog);
            }
        }
    },
);

Deno.test('ship invalid release inputs leave files, index and refs unchanged', async () => {
    for (const content of ['', ' \n\t\n', '### Added\n\n### Fixed\n']) {
        await fixture(
            async (repo, origin) => {
                const before = await snapshot(repo, origin);
                for (const args of [['patch'], ['patch', '--dry']]) {
                    const result = await ship(repo, ...args);
                    expect(result.code).toBe(1);
                    expect(result.stderr).toContain('Unreleased');
                    expect(await snapshot(repo, origin)).toEqual(before);
                }
            },
            initial.replace(entries, content),
        );
    }
});

Deno.test(
    'ship retains local release state on remote races, rejection, and missing atomic support',
    async () => {
        for (const failure of ['race', 'tag', 'reject', 'atomic']) {
            await fixture(async (repo, origin) => {
                const old = await git(repo, 'rev-parse', 'HEAD');
                let remoteMain = old;
                if (failure === 'atomic') {
                    await git(origin, 'config', 'receive.advertiseAtomic', 'false');
                } else if (failure === 'reject') {
                    await Deno.writeTextFile(
                        join(origin, 'hooks/pre-receive'),
                        '#!/bin/sh\nexit 1\n',
                        { mode: 0o755 },
                    );
                } else {
                    // A real pre-push hook changes the bare origin after ship's preflight.
                    if (failure === 'race') {
                        const tree = await git(repo, 'rev-parse', 'HEAD^{tree}');
                        remoteMain = await git(
                            repo,
                            'commit-tree',
                            tree,
                            '-p',
                            old,
                            '-m',
                            'Concurrent',
                        );
                        await git(
                            repo,
                            'push',
                            'origin',
                            `${remoteMain}:refs/heads/fixture-object`,
                        );
                    }
                    const ref = failure === 'race' ? 'refs/heads/main' : 'refs/tags/v0.1.1';
                    await Deno.writeTextFile(
                        join(repo, '.git/hooks/pre-push'),
                        `#!/bin/sh\ngit --git-dir='${origin}' update-ref ${ref} ${remoteMain}\n`,
                        { mode: 0o755 },
                    );
                }
                const result = await ship(repo, 'patch');
                expect(result.code).toBe(1);
                expect(result.stderr).toContain('atomic push');
                expect(result.stderr).toContain('retained');
                expect(result.stderr).toContain('v0.1.1');
                const head = await git(repo, 'rev-parse', 'HEAD');
                expect(head).not.toBe(old);
                expect(await git(repo, 'rev-parse', 'v0.1.1^{commit}')).toBe(head);
                expect(await git(repo, 'status', '--porcelain')).toBe('');
                expect(await Deno.readTextFile(join(repo, versionPath))).toBe(
                    versionSource.replace('0.1.0', '0.1.1'),
                );
                expect(await git(origin, 'rev-parse', 'main')).toBe(remoteMain);
                const remoteTag = await run(origin, 'git', [
                    'rev-parse',
                    '--verify',
                    'refs/tags/v0.1.1',
                ]);
                if (failure === 'tag') {
                    expect(remoteTag.stdout.trim()).toBe(old);
                } else {
                    expect(remoteTag.code).not.toBe(0);
                }
            });
        }
    },
);
