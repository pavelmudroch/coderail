import { expect } from '@std/expect';
import { fromFileUrl, join } from '@std/path';

import { checkPackage } from '../../tools/check-package.ts';
import { type Compile, packageRelease } from '../../tools/package-build.ts';
import {
    type PackageOptions,
    parsePackageArguments,
    targets,
} from '../../tools/package-options.ts';
import { entries, fixture as releaseFixture } from '../commands/upgrade/release-fixture.ts';

const entrypoint = fromFileUrl(new URL('../../tools/package.ts', import.meta.url));
const encode = new TextEncoder();

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing test fixture value');
    }
    return value;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd,
        env: {
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: Deno.build.os === 'windows' ? 'NUL' : '/dev/null',
        },
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    expect(result.success, new TextDecoder().decode(result.stderr)).toBe(true);
    return new TextDecoder().decode(result.stdout).trim();
}

async function fixture(
    run: (root: string, options: PackageOptions) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'package-test-' });
    try {
        await Deno.mkdir(join(root, 'src/cli'), { recursive: true });
        await Deno.writeTextFile(
            join(root, 'src/cli/version.ts'),
            "export const CODERAIL_VERSION = '0.1.0';\n",
        );
        await Deno.writeTextFile(join(root, 'src/main.ts'), 'console.log("fixture");\n');
        await git(root, 'init', '--quiet');
        await git(root, 'add', '.');
        await git(
            root,
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            'commit',
            '-qm',
            'Fixture',
        );
        await run(root, {
            target: targets[0],
            version: '0.1.0',
            commit: await git(root, 'rev-parse', 'HEAD'),
            output: join(root, 'out'),
        });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

// Negative paths use format-correct tiny binaries; real compiler acceptance lives separately.
const compile: Compile = async (_root, options, output) => {
    await Deno.writeFile(output, required(entries('0.1.0', options.target)[0]).data);
};

Deno.test('package help works outside Git without permissions or dependency fetching', async () => {
    const root = await Deno.makeTempDir();
    try {
        const result = await new Deno.Command(Deno.execPath(), {
            cwd: root,
            env: { PATH: '' },
            args: ['run', '--no-config', '--cached-only', '--no-prompt', entrypoint, '--help'],
            stdout: 'piped',
            stderr: 'piped',
        }).output();
        expect(result.code).toBe(0);
        expect(result.stderr.length).toBe(0);
        const help = new TextDecoder().decode(result.stdout);
        for (const word of ['--target', '--version', '--commit', '--output', '.zip', '.sha256']) {
            expect(help).toContain(word);
        }
        expect([...Deno.readDirSync(root)]).toEqual([]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('package rejects missing, repeated, unknown and invalid options', () => {
    const valid = [
        '--target',
        targets[0],
        '--version',
        '0.1.0',
        '--commit',
        'a'.repeat(40),
        '--output',
        'out',
    ];
    expect(parsePackageArguments(valid)).toEqual({
        target: targets[0],
        version: '0.1.0',
        commit: 'a'.repeat(40),
        output: 'out',
    });
    for (const args of [
        [],
        valid.slice(2),
        [...valid, '--target', targets[0]],
        [...valid, '--extra', 'x'],
        ['--help', ...valid],
    ]) {
        expect(() => parsePackageArguments(args)).toThrow();
    }
    for (const [index, values] of [
        [1, ['riscv64-unknown-linux-gnu']],
        [3, ['v1.2.3', '01.2.3', '1.2', '1.2.3-beta']],
        [5, ['ABC', 'A'.repeat(40), 'a'.repeat(39)]],
        [7, ['']],
    ] as const) {
        for (const value of values) {
            const args = [...valid];
            args[index] = value;
            expect(() => parsePackageArguments(args)).toThrow();
        }
    }
});

Deno.test(
    'package checks source revision, clean inputs and stable source version before compiling',
    async () => {
        await fixture(async (root, options) => {
            const forbidden: Compile = () => {
                throw new Error('unexpected compile');
            };
            await expect(
                packageRelease({ ...options, commit: 'a'.repeat(40) }, root, forbidden),
            ).rejects.toThrow('HEAD');
            await expect(
                packageRelease({ ...options, version: '1.0.0' }, root, forbidden),
            ).rejects.toThrow('source version');
            await Deno.writeTextFile(join(root, 'src/main.ts'), 'dirty');
            await expect(packageRelease(options, root, forbidden)).rejects.toThrow('clean');
        });
    },
);

Deno.test(
    'package produces exact stable/canary identity and stages all six executable formats',
    async () => {
        await fixture(async (root, base) => {
            for (const target of targets) {
                for (const version of ['0.1.0', 'canary']) {
                    const options = {
                        ...base,
                        target,
                        version,
                        output: join(root, `out-${target}-${version}`),
                    };
                    await packageRelease(options, root, compile);
                    const name = `coderail-${target}.zip`;
                    const archive = await Deno.readFile(join(options.output, name));
                    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', archive));
                    const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(
                        '',
                    );
                    expect(await Deno.readTextFile(join(options.output, `${name}.sha256`))).toBe(
                        `${hash}  ${name}\n`,
                    );
                    await checkPackage(options, async (stage) => {
                        expect(stage.build).toEqual({
                            schemaVersion: 1,
                            version,
                            commit: base.commit,
                            target,
                        });
                        expect(
                            JSON.parse(await Deno.readTextFile(join(stage.root, 'build.json'))),
                        ).toEqual(stage.build);
                        expect(await Deno.readFile(stage.executable)).toEqual(
                            required(entries('0.1.0', target)[0]).data,
                        );
                    });
                }
            }
        });
    },
);

Deno.test(
    'package preserves nested resources and accepts each combination of missing/empty roots',
    async () => {
        for (const instructions of ['missing', 'empty', 'nested']) {
            for (const templates of ['missing', 'empty', 'nested']) {
                await fixture(async (root, options) => {
                    for (const [name, state] of [
                        ['instructions', instructions],
                        ['templates', templates],
                    ] as const) {
                        if (state !== 'missing') {
                            await Deno.mkdir(join(root, 'assets', name), { recursive: true });
                        }
                        if (state === 'nested') {
                            await Deno.mkdir(join(root, 'assets', name, 'nested'));
                            await Deno.writeTextFile(
                                join(root, 'assets', name, 'nested/a.md'),
                                name,
                            );
                        }
                    }
                    await git(root, 'add', '.');
                    await git(
                        root,
                        '-c',
                        'user.name=Test',
                        '-c',
                        'user.email=test@example.com',
                        'commit',
                        '--allow-empty',
                        '-qm',
                        'Resources',
                    );
                    options.commit = await git(root, 'rev-parse', 'HEAD');
                    await packageRelease(options, root, compile);
                    await checkPackage(options, async (stage) => {
                        for (const [name, state] of [
                            ['instructions', instructions],
                            ['templates', templates],
                        ] as const) {
                            if (state === 'nested') {
                                expect(
                                    await Deno.readTextFile(join(stage.root, name, 'nested/a.md')),
                                ).toBe(name);
                            } else {
                                await expect(Deno.lstat(join(stage.root, name))).rejects.toThrow();
                            }
                        }
                    });
                });
            }
        }
    },
);

Deno.test(
    'package rejects unsafe resource roots, links, names and empty files before readiness',
    async () => {
        for (const invalid of [
            'root-file',
            'root-link',
            'assets-link',
            'link',
            'empty',
            'reserved',
            'case',
        ]) {
            await fixture(async (root, options) => {
                await Deno.mkdir(join(root, 'assets'));
                const path = join(root, 'assets/instructions');
                if (invalid === 'root-file') {
                    await Deno.writeTextFile(path, 'bad');
                } else if (invalid === 'root-link') {
                    await Deno.symlink('../src', path);
                } else if (invalid === 'assets-link') {
                    await Deno.remove(join(root, 'assets'));
                    await Deno.symlink('src', join(root, 'assets'));
                } else {
                    await Deno.mkdir(path);
                    if (invalid === 'link') {
                        await Deno.symlink('../../src/main.ts', join(path, 'a.md'));
                    }
                    if (invalid === 'empty') {
                        await Deno.writeFile(join(path, 'a.md'), new Uint8Array());
                    }
                    if (invalid === 'reserved') {
                        await Deno.writeTextFile(join(path, 'CON.md'), 'bad');
                    }
                    if (invalid === 'case') {
                        await Deno.writeTextFile(join(path, 'a.md'), 'a');
                        await Deno.writeTextFile(join(path, 'A.md'), 'A');
                    }
                }
                await git(root, 'add', '.');
                await git(
                    root,
                    '-c',
                    'user.name=Test',
                    '-c',
                    'user.email=test@example.com',
                    'commit',
                    '-qm',
                    'Unsafe',
                );
                options.commit = await git(root, 'rev-parse', 'HEAD');
                await expect(packageRelease(options, root, compile)).rejects.toThrow();
                await expect(Deno.stat(options.output)).rejects.toThrow();
            });
        }
    },
);

Deno.test(
    'package reports compilation and validation failures without publishing outputs',
    async () => {
        await fixture(async (root, options) => {
            for (const compiler of [
                () => Promise.reject(new Error('compiler failed')),
                async () => {},
                async (_r: string, _o: PackageOptions, path: string) => {
                    await Deno.writeTextFile(path, 'wrong architecture');
                },
            ]) {
                await expect(packageRelease(options, root, compiler)).rejects.toThrow();
                await expect(Deno.stat(options.output)).rejects.toThrow();
            }
            await packageRelease(options, root, compile);
            await expect(packageRelease(options, root, compile)).rejects.toThrow('exists');
            for (const corrupt of ['checksum', 'archive', 'missing', 'identity']) {
                const name = join(options.output, `coderail-${options.target}.zip`);
                const archive = await Deno.readFile(name);
                const sidecar = await Deno.readTextFile(`${name}.sha256`);
                if (corrupt === 'checksum') {
                    await Deno.writeTextFile(`${name}.sha256`, sidecar.trimEnd());
                }
                if (corrupt === 'archive') {
                    await Deno.writeFile(name, encode.encode('corrupt'));
                }
                if (corrupt === 'missing') {
                    await Deno.remove(name);
                }
                await expect(
                    checkPackage(
                        corrupt === 'identity' ? { ...options, commit: 'b'.repeat(40) } : options,
                    ),
                ).rejects.toThrow();
                await Deno.writeFile(name, archive);
                await Deno.writeTextFile(`${name}.sha256`, sidecar);
            }
        });
    },
);

Deno.test(
    'package checks defer ZIP layout and architecture rejection to the staging consumer',
    async () => {
        await fixture(async (_root, options) => {
            for (const invalid of ['architecture', 'layout', 'metadata', 'empty-directory']) {
                const items = entries('0.1.0', options.target);
                required(items[3]).data = encode.encode(
                    JSON.stringify({
                        schemaVersion: 1,
                        version: options.version,
                        commit: options.commit,
                        target: options.target,
                    }),
                );
                if (invalid === 'architecture') {
                    required(items[0]).data = required(entries('0.1.0', targets[1])[0]).data;
                }
                if (invalid === 'layout') {
                    required(items[0]).name = 'assets/cr';
                }
                if (invalid === 'metadata') {
                    required(items[3]).data = encode.encode('{}');
                }
                if (invalid === 'empty-directory') {
                    items.push({
                        name: 'instructions/empty/',
                        data: new Uint8Array(),
                        mode: 0o40755,
                    });
                }
                const mock = await releaseFixture({
                    entries: items,
                    releases: [
                        {
                            id: 1,
                            tag_name: 'v0.1.0',
                            draft: false,
                            prerelease: false,
                            target_commitish: options.commit,
                            updated_at: 'today',
                        },
                    ],
                });
                const { resolveRelease, withStagedDistribution } =
                    await import('../../src/commands/upgrade/distribution.ts');
                const resolved = await resolveRelease(
                    { version: '0.1.0' },
                    options.target,
                    mock.fetcher,
                );
                if (invalid === 'empty-directory') {
                    await withStagedDistribution(
                        resolved,
                        async (stage) => {
                            expect(
                                (await Deno.stat(join(stage.root, 'instructions/empty')))
                                    .isDirectory,
                            ).toBe(true);
                        },
                        mock.fetcher,
                    );
                } else {
                    await expect(
                        withStagedDistribution(resolved, async () => {}, mock.fetcher),
                    ).rejects.toThrow();
                }
            }
        });
    },
);

Deno.test(
    'staging accepts omitted and explicitly empty archive resource roots independently',
    async () => {
        const { resolveRelease, withStagedDistribution } =
            await import('../../src/commands/upgrade/distribution.ts');
        for (const directories of [
            [],
            ['instructions'],
            ['templates'],
            ['instructions', 'templates'],
        ]) {
            const items = entries().filter((entry) => !entry.name.includes('/'));
            for (const name of directories) {
                items.push({ name: `${name}/`, data: new Uint8Array(), mode: 0o40755 });
            }
            const mock = await releaseFixture({ entries: items });
            const resolved = await resolveRelease({ version: '2.10.0' }, targets[0], mock.fetcher);
            await withStagedDistribution(
                resolved,
                async (stage) => {
                    for (const name of ['instructions', 'templates']) {
                        if (directories.includes(name)) {
                            expect([...Deno.readDirSync(join(stage.root, name))]).toEqual([]);
                        } else {
                            await expect(Deno.lstat(join(stage.root, name))).rejects.toThrow();
                        }
                    }
                },
                mock.fetcher,
            );
        }
    },
);

Deno.test(
    'packaging compiles committed source while excluding untracked and ignored inputs',
    async () => {
        await fixture(async (root, options) => {
            await Deno.writeTextFile(join(root, 'untracked.ts'), 'untrusted');
            await Deno.writeTextFile(join(root, '.git/info/exclude'), 'ignored.ts\n');
            await Deno.writeTextFile(join(root, 'ignored.ts'), 'ignored');
            const original = await Deno.readTextFile(join(root, 'src/main.ts'));
            await packageRelease(options, root, async (snapshot, identity, executable) => {
                expect(snapshot).not.toBe(root);
                expect(await Deno.readTextFile(join(snapshot, 'src/main.ts'))).toBe(original);
                expect(await git(snapshot, 'rev-parse', 'HEAD')).toBe(identity.commit);
                await expect(Deno.stat(join(snapshot, 'untracked.ts'))).rejects.toThrow();
                await expect(Deno.stat(join(snapshot, 'ignored.ts'))).rejects.toThrow();
                await compile(snapshot, identity, executable);
            });
        });
    },
);
