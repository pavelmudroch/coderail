import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '@fs';
import type { ConnectorFile, HarnessConnector } from '../../src/harness/connector.ts';
import { InstallManifest } from '../../src/install-manifest.ts';
import { InstructionOperations, type OperationOptions } from '../../src/instruction-operations.ts';
import { Confirmation } from '../../src/instruction-operations/confirmation.ts';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const output = (path: string, text = path): ConnectorFile => ({ path, content: bytes(text) });

async function fixture(
    run: (root: string, bundle: string, connector: HarnessConnector) => Promise<void>,
): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const bundle = join(root, 'bundle');
    try {
        await Deno.mkdir(join(bundle, 'skills'), { recursive: true });
        await Deno.mkdir(join(bundle, 'agents'));
        await Deno.writeTextFile(join(bundle, 'AGENTS.md'), 'global');
        const connector: HarnessConnector = {
            name: 'fake',
            home: join(root, 'home'),
            manifestPath: join(root, 'home', 'manifest.json'),
            translateGlobalInstructions(file): Promise<ConnectorFile[]> {
                return Promise.resolve([file]);
            },
            translateSkill(_name, files): Promise<ConnectorFile[]> {
                return Promise.resolve(files);
            },
            translateSubagent(file): Promise<ConnectorFile[]> {
                return Promise.resolve([file]);
            },
            [Symbol.dispose](): void {},
        };
        await run(root, bundle, connector);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

function options(overrides: Partial<OperationOptions> = {}): OperationOptions {
    return {
        force: false,
        confirmation: 'prompt',
        nonInteractive: true,
        signal: new AbortController().signal,
        ...overrides,
    };
}

async function missing(path: string): Promise<void> {
    await expect(Deno.lstat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
}

Deno.test('install loads complete ordered bundles, preserves translation order and binary bytes', async () => {
    await fixture(async (root, bundle, connector) => {
        for (const name of ['z', 'a']) {
            await Deno.mkdir(join(bundle, 'skills', name, 'nested'), { recursive: true });
            await Deno.writeTextFile(join(bundle, 'skills', name, 'SKILL.md'), name);
            await Deno.writeFile(
                join(bundle, 'skills', name, 'nested', 'binary'),
                new Uint8Array([0, 255, 128]),
            );
        }
        for (const name of ['z.md', 'a.md']) {
            await Deno.writeTextFile(join(bundle, 'agents', name), name);
        }
        const seen: string[] = [];
        const inputs: ConnectorFile[][] = [];
        connector.translateGlobalInstructions = (file): Promise<ConnectorFile[]> => {
            seen.push(file.path);
            return Promise.resolve([output('second'), output('first')]);
        };
        connector.translateSkill = (name, files): Promise<ConnectorFile[]> => {
            seen.push(name);
            inputs.push(files);
            expect(files.map((file) => file.path)).toEqual(['SKILL.md', 'nested/binary']);
            expect(files[1]?.content).toEqual(new Uint8Array([0, 255, 128]));
            return Promise.resolve(
                files.map((file) => ({ ...file, path: `${name}/${file.path}` })),
            );
        };
        connector.translateSubagent = (file): Promise<ConnectorFile[]> => {
            seen.push(file.path);
            return Promise.resolve([{ ...file, path: `agents/${file.path}` }]);
        };
        const result = await InstructionOperations.install(connector, bundle, options());
        expect(result.error).toBeUndefined();
        expect(seen).toEqual(['AGENTS.md', 'a', 'z', 'a.md', 'z.md']);
        const paths = [
            'second',
            'first',
            'a/SKILL.md',
            'a/nested/binary',
            'z/SKILL.md',
            'z/nested/binary',
            'agents/a.md',
            'agents/z.md',
        ];
        expect(result.outcomes).toEqual(paths.map((path) => ({ path, status: 'installed' })));
        expect((await InstallManifest.load(connector.manifestPath))?.files.map((file) => file.path))
            .toEqual(paths);
        expect(await Deno.readFile(join(connector.home, 'a/nested/binary')))
            .toEqual(new Uint8Array([0, 255, 128]));
        const other = {
            ...connector,
            home: join(root, 'other'),
            manifestPath: join(root, 'other', 'manifest.json'),
        };
        expect((await InstructionOperations.install(other, bundle, options())).error)
            .toBeUndefined();
        expect(inputs[0]).not.toBe(inputs[2]);
        expect(inputs[0]?.[0]).not.toBe(inputs[2]?.[0]);
        expect(inputs[0]?.[0]?.content).not.toBe(inputs[2]?.[0]?.content);
    });
});

Deno.test('preparation failures leave home absent', async () => {
    const mutations = [
        async (bundle: string): Promise<void> => {
            await Deno.remove(bundle, { recursive: true });
        },
        async (bundle: string): Promise<void> => {
            await Deno.remove(join(bundle, 'AGENTS.md'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.mkdir(join(bundle, 'extra'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.mkdir(join(bundle, 'skills', 'bad'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.writeTextFile(join(bundle, 'skills', 'bad'), 'file');
        },
        async (bundle: string): Promise<void> => {
            await Deno.mkdir(join(bundle, 'agents', 'bad'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.remove(join(bundle, 'AGENTS.md'));
            await Deno.symlink('/missing', join(bundle, 'AGENTS.md'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.symlink('/missing', join(bundle, 'skills', 'bad'));
        },
        async (bundle: string): Promise<void> => {
            await Deno.mkdir(join(bundle, 'skills', 'bad'));
            await Deno.symlink('/missing', join(bundle, 'skills', 'bad', 'SKILL.md'));
        },
    ];
    for (const mutate of mutations) {
        await fixture(async (_root, bundle, connector) => {
            await mutate(bundle);
            expect((await InstructionOperations.install(connector, bundle, options())).error)
                .toBeInstanceOf(Error);
            await missing(connector.home);
        });
    }
    await fixture(async (_root, bundle, connector) => {
        const original = Deno.readFile;
        try {
            Deno.readFile = (): never => {
                throw new Deno.errors.PermissionDenied('read');
            };
            expect((await InstructionOperations.install(connector, bundle, options())).error)
                .toBeInstanceOf(Deno.errors.PermissionDenied);
        } finally {
            Deno.readFile = original;
        }
        connector.translateGlobalInstructions = (): never => {
            throw new Error('translation');
        };
        expect((await InstructionOperations.install(connector, bundle, options())).error)
            .toEqual(new Error('translation'));
        await missing(connector.home);
    });
});

Deno.test('invalid aggregate outputs and locations fail before creating directories, even with force', async () => {
    const invalid = [
        '',
        '/escape',
        '../home-sibling/escape',
        'C:escape',
        'C:/escape',
        'a\\b',
        'a\0b',
        'a//b',
        'a/',
        '.',
        '..',
        './a',
        'a/../b',
        'manifest.json',
        'manifest.json/child',
    ];
    for (const paths of [...invalid.map((path) => [path]), ['a', 'a'], ['a', 'a/b']]) {
        await fixture(async (_root, bundle, connector) => {
            connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
                Promise.resolve(paths.map((path) => output(path)));
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, confirmation: 'yes' }),
                )).error,
            ).toBeInstanceOf(Error);
            await missing(connector.home);
        });
    }
    await fixture(async (_root, bundle, connector) => {
        for (
            const locations of [{ home: 'relative' }, { manifestPath: 'relative' }, {
                manifestPath: join(connector.home, 'nested', 'manifest.json'),
            }]
        ) {
            expect(
                (await InstructionOperations.install(
                    { ...connector, ...locations },
                    bundle,
                    options(),
                )).error,
            ).toBeInstanceOf(Error);
            await missing(connector.home);
        }
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([{ path: 'bad', content: 'bad' as unknown as Uint8Array }]);
        expect((await InstructionOperations.install(connector, bundle, options())).error)
            .toEqual(new Error('Invalid output bytes'));
    });
});

Deno.test('safe reinstall uses saved baselines, recreates missing paths and reconciles ownership order', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('obsolete'), output('nested/file'), output('last')]);
        expect((await InstructionOperations.install(connector, bundle, options())).error)
            .toBeUndefined();
        await Deno.remove(join(connector.home, 'nested'), { recursive: true });
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('last', 'updated'), output('new'), output('nested/file')]);
        const result = await InstructionOperations.install(connector, bundle, options());
        expect(result.error).toBeUndefined();
        expect(result.outcomes).toEqual([
            { path: 'last', status: 'installed' },
            { path: 'new', status: 'installed' },
            { path: 'nested/file', status: 'installed' },
            { path: 'obsolete', status: 'removed' },
        ]);
        expect(await Deno.readTextFile(join(connector.home, 'last'))).toBe('updated');
        const saved = await InstallManifest.load(connector.manifestPath);
        expect(saved?.files.map((item) => item.path)).toEqual([
            'nested/file',
            'last',
            'new',
        ]);
        await missing(join(connector.home, 'obsolete'));
        expect(await Deno.readTextFile(join(connector.home, 'nested/file'))).toBe('nested/file');
    });
});

Deno.test('conflicts block all writes including matching untracked bytes and modified obsolete files', async () => {
    await fixture(async (_root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        await Deno.writeTextFile(join(connector.home, 'conflict'), 'conflict');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('safe'), output('conflict')]);
        const result = await InstructionOperations.install(connector, bundle, options());
        expect(result.error).toBeInstanceOf(Error);
        expect(result.outcomes).toEqual([]);
        await missing(join(connector.home, 'safe'));
        await missing(connector.manifestPath);
        await InstallManifest.save(
            connector.manifestPath,
            await InstallManifest.capture(connector.home, ['conflict']),
        );
        await Deno.writeTextFile(join(connector.home, 'conflict'), 'CONFLICT');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('safe')]);
        expect((await InstructionOperations.install(connector, bundle, options())).error)
            .toBeInstanceOf(Error);
        await missing(join(connector.home, 'safe'));
    });
});

Deno.test('declines preserve tracked baselines and order while untracked declines remain untracked', async () => {
    await fixture(async (_root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        for (const path of ['tracked', 'untracked']) {
            await Deno.writeTextFile(join(connector.home, path), 'old');
        }
        const baseline = await InstallManifest.capture(connector.home, ['tracked']);
        await InstallManifest.save(connector.manifestPath, baseline);
        await Deno.writeTextFile(join(connector.home, 'tracked'), 'OLD');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('new'), output('tracked'), output('untracked')]);
        const result = await InstructionOperations.install(
            connector,
            bundle,
            options({ force: true, confirmation: 'no' }),
        );
        expect(result).toEqual({
            outcomes: [
                { path: 'new', status: 'installed' },
                { path: 'tracked', status: 'skipped' },
                { path: 'untracked', status: 'skipped' },
            ],
        });
        expect((await InstallManifest.load(connector.manifestPath))?.files[0]).toEqual(
            baseline.files[0],
        );
        expect((await InstallManifest.load(connector.manifestPath))?.files.map((file) => file.path))
            .toEqual(['tracked', 'new']);
        expect(await Deno.readTextFile(join(connector.home, 'tracked'))).toBe('OLD');
        expect(await Deno.readTextFile(join(connector.home, 'untracked'))).toBe('old');
        const accepted = await InstructionOperations.install(
            connector,
            bundle,
            options({ force: true, confirmation: 'yes' }),
        );
        expect(accepted.error).toBeUndefined();
        expect(accepted.outcomes.every((outcome) => outcome.status === 'installed')).toBe(true);
        expect(await Deno.readTextFile(join(connector.home, 'tracked'))).toBe('tracked');
        expect(await Deno.readTextFile(join(connector.home, 'untracked'))).toBe('untracked');
    });
});

Deno.test('all prompts finish before mutation; terminal policy and prompt failures leave files unchanged', async () => {
    await fixture(async (_root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        for (const path of ['a', 'b']) await Deno.writeTextFile(join(connector.home, path), 'old');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('safe'), output('a'), output('b')]);
        const original = { ...Confirmation };
        const asked: string[] = [];
        try {
            Confirmation.available = (): boolean => false;
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, nonInteractive: false }),
                )).error,
            ).toBeInstanceOf(Error);
            Confirmation.available = (): boolean => true;
            expect(
                (await InstructionOperations.install(connector, bundle, options({ force: true })))
                    .error,
            ).toBeInstanceOf(Error);
            Confirmation.ask = async (path): Promise<boolean> => {
                asked.push(path);
                await missing(join(connector.home, 'safe'));
                if (path === 'b') throw new Error('prompt failed');
                return true;
            };
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, nonInteractive: false }),
                )).error,
            ).toEqual(new Error('prompt failed'));
            expect(asked).toEqual(['a', 'b']);
            await missing(join(connector.home, 'safe'));
            expect(await Deno.readTextFile(join(connector.home, 'a'))).toBe('old');
            Confirmation.ask = (path): Promise<boolean> => Promise.resolve(path === 'a');
            const result = await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, nonInteractive: false }),
            );
            expect(result.error).toBeUndefined();
            expect(result.outcomes).toEqual([{ path: 'safe', status: 'installed' }, {
                path: 'a',
                status: 'installed',
            }, { path: 'b', status: 'skipped' }]);
        } finally {
            Object.assign(Confirmation, original);
        }
    });
});

Deno.test('unsafe manifest leaves and malformed contents fail closed', async () => {
    for (
        const kind of [
            'directory',
            'live',
            'dangling',
            'malformed',
            'version',
            'reserved',
            'ancestor',
        ]
    ) {
        await fixture(async (_root, bundle, connector) => {
            await Deno.mkdir(connector.home);
            if (kind === 'directory') await Deno.mkdir(connector.manifestPath);
            else if (kind === 'live' || kind === 'dangling') {
                await Deno.symlink(
                    kind === 'live' ? join(bundle, 'AGENTS.md') : '/missing',
                    connector.manifestPath,
                );
            } else {
                const paths = kind === 'reserved' ? ['manifest.json'] : ['file', 'file/child'];
                const content = kind === 'malformed'
                    ? '{'
                    : kind === 'version'
                    ? '{"version":2,"files":[]}'
                    : JSON.stringify({
                        version: 1,
                        files: paths.map((path) => ({ path, size: 0, checksum: 'a'.repeat(64) })),
                    });
                await Deno.writeTextFile(connector.manifestPath, content);
            }
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, confirmation: 'yes' }),
                )).error,
            ).toBeInstanceOf(Error);
            await missing(join(connector.home, 'AGENTS.md'));
        });
    }
});

Deno.test('unsafe tracked and desired paths reject symlinks, directories, and non-directory ancestors', async () => {
    for (const tracked of [false, true]) {
        for (const kind of ['directory', 'live', 'dangling', 'ancestor-file', 'ancestor-link']) {
            await fixture(async (_root, bundle, connector) => {
                await Deno.mkdir(join(connector.home, 'nested'), { recursive: true });
                const path = kind.startsWith('ancestor') ? 'nested/file' : 'file';
                await Deno.writeTextFile(join(connector.home, path), 'old');
                if (tracked) {
                    await InstallManifest.save(
                        connector.manifestPath,
                        await InstallManifest.capture(connector.home, [path]),
                    );
                }
                await Deno.remove(
                    join(connector.home, kind.startsWith('ancestor') ? 'nested' : 'file'),
                    { recursive: true },
                );
                if (kind === 'directory') await Deno.mkdir(join(connector.home, path));
                else if (kind === 'ancestor-file') {
                    await Deno.writeTextFile(join(connector.home, 'nested'), 'old');
                } else {await Deno.symlink(
                        kind === 'dangling' ? '/missing' : bundle,
                        join(connector.home, kind === 'ancestor-link' ? 'nested' : path),
                    );}
                connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
                    Promise.resolve([output('safe'), output(tracked ? 'other' : path)]);
                expect(
                    (await InstructionOperations.install(
                        connector,
                        bundle,
                        options({ force: true, confirmation: 'yes' }),
                    )).error,
                ).toBeInstanceOf(Error);
                await missing(join(connector.home, 'safe'));
            });
        }
    }
});

Deno.test('home aliases work; unsafe homes and absent-home ancestors fail', async () => {
    await fixture(async (root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        const alias = join(root, 'alias');
        await Deno.symlink(connector.home, alias);
        expect(
            (await InstructionOperations.install(
                { ...connector, home: alias, manifestPath: join(alias, 'manifest.json') },
                bundle,
                options(),
            )).error,
        ).toBeUndefined();
        for (
            const home of [join(root, 'file'), join(root, 'file', 'absent'), join(alias, 'absent')]
        ) {
            await Deno.writeTextFile(join(root, 'file'), 'file');
            expect(
                (await InstructionOperations.install(
                    { ...connector, home, manifestPath: join(home, 'manifest.json') },
                    bundle,
                    options(),
                )).error,
            ).toBeInstanceOf(Error);
        }
    });
});

Deno.test('empty output and all declined fresh installs do not create an empty manifest', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> => Promise.resolve([]);
        expect(await InstructionOperations.install(connector, bundle, options())).toEqual({
            outcomes: [],
        });
        await missing(connector.home);
        await Deno.mkdir(connector.home);
        await Deno.writeTextFile(join(connector.home, 'file'), 'old');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('file')]);
        expect(
            await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, confirmation: 'no' }),
            ),
        ).toEqual({ outcomes: [{ path: 'file', status: 'skipped' }] });
        await missing(connector.manifestPath);
    });
});

Deno.test('install creates missing ordinary home ancestors only after preparation succeeds', async () => {
    await fixture(async (root, bundle, connector) => {
        const home = join(root, 'absent', 'nested', 'home');
        const target = { ...connector, home, manifestPath: join(home, 'manifest.json') };
        const original = connector.translateGlobalInstructions;
        target.translateGlobalInstructions = (): never => {
            throw new Error('prepare');
        };
        expect((await InstructionOperations.install(target, bundle, options())).error)
            .toEqual(new Error('prepare'));
        await missing(join(root, 'absent'));
        target.translateGlobalInstructions = original;
        expect((await InstructionOperations.install(target, bundle, options())).error)
            .toBeUndefined();
        expect(await Deno.readTextFile(join(home, 'AGENTS.md'))).toBe('global');
    });
});

Deno.test('late conflicts block before any prompt and access failures remain failures', async () => {
    await fixture(async (_root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        await Deno.writeTextFile(join(connector.home, 'late'), 'old');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('safe'), output('late')]);
        const ask = Confirmation.ask;
        let prompted = false;
        const lstat = Deno.lstat;
        try {
            Confirmation.ask = (): never => {
                prompted = true;
                throw new Error('unexpected');
            };
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ nonInteractive: false }),
                )).error,
            ).toBeInstanceOf(Error);
            expect(prompted).toBe(false);
            await missing(join(connector.home, 'safe'));
            Deno.lstat = (path): ReturnType<typeof lstat> => {
                if (String(path).endsWith('/late')) {
                    throw new Deno.errors.PermissionDenied('denied');
                }
                return lstat(path);
            };
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, confirmation: 'yes' }),
                )).error,
            )
                .toBeInstanceOf(Deno.errors.PermissionDenied);
            await missing(join(connector.home, 'safe'));
            Deno.lstat = (path): ReturnType<typeof lstat> =>
                String(path).endsWith('/late')
                    ? Promise.resolve(
                        { isFile: false, isSymlink: false, isDirectory: false } as Deno.FileInfo,
                    )
                    : lstat(path);
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, confirmation: 'yes' }),
                )).error,
            ).toBeInstanceOf(Error);
        } finally {
            Deno.lstat = lstat;
            Confirmation.ask = ask;
        }
    });
});

Deno.test('write and capture failures retain completed outcomes and persist completed baselines', async () => {
    for (const failure of ['write', 'capture']) {
        await fixture(async (_root, bundle, connector) => {
            connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
                Promise.resolve([output('a'), output('b'), output('c')]);
            const write = Fs.write;
            const capture = InstallManifest.capture;
            try {
                Fs.write = (path, content): Promise<void> => {
                    if (failure === 'write' && path.endsWith('/b')) throw new Error('write');
                    return write(path, content);
                };
                InstallManifest.capture = (root, paths): ReturnType<typeof capture> => {
                    if (failure === 'capture' && paths[0] === 'b') throw new Error('capture');
                    return capture(root, paths);
                };
                const result = await InstructionOperations.install(connector, bundle, options());
                expect(result.error).toBeInstanceOf(Error);
                expect((result.error as Error).message).toContain('changed bytes');
                expect((result.error as Error).cause).toEqual(new Error(failure));
                expect(result.outcomes).toEqual([{ path: 'a', status: 'installed' }]);
                expect(
                    (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                        file.path
                    ),
                )
                    .toEqual(['a']);
                await missing(join(connector.home, 'c'));
                if (failure === 'capture') {
                    expect(await Deno.readTextFile(join(connector.home, 'b'))).toBe('b');
                } else await missing(join(connector.home, 'b'));
            } finally {
                Fs.write = write;
                InstallManifest.capture = capture;
            }
        });
    }
});

Deno.test('save failures include persistence error and retain installed outcomes', async () => {
    await fixture(async (_root, bundle, connector) => {
        const save = InstallManifest.save;
        let attempts = 0;
        try {
            InstallManifest.save = (): never => {
                attempts++;
                throw new Error('save');
            };
            const result = await InstructionOperations.install(connector, bundle, options());
            expect(result.error).toBeInstanceOf(AggregateError);
            expect((result.error as AggregateError).errors[1]).toEqual(new Error('save'));
            expect(attempts).toBe(2);
            expect(result.outcomes).toEqual([{ path: 'AGENTS.md', status: 'installed' }]);
            expect(await Deno.readTextFile(join(connector.home, 'AGENTS.md'))).toBe('global');
            await missing(connector.manifestPath);
        } finally {
            InstallManifest.save = save;
        }
    });
});

Deno.test('failed first capture leaves bytes but does not create an empty baseline', async () => {
    for (const empty of [false, true]) {
        await fixture(async (_root, bundle, connector) => {
            const capture = InstallManifest.capture;
            try {
                InstallManifest.capture = (): ReturnType<typeof capture> => {
                    if (empty) return Promise.resolve({ version: 1, files: [] });
                    throw new Error('capture failed');
                };
                const result = await InstructionOperations.install(connector, bundle, options());
                expect(result.error).toBeInstanceOf(Error);
                expect((result.error as Error).cause).toEqual(
                    new Error(empty ? 'Missing captured baseline: AGENTS.md' : 'capture failed'),
                );
                expect(result.outcomes).toEqual([]);
                expect(await Deno.readTextFile(join(connector.home, 'AGENTS.md'))).toBe('global');
                await missing(connector.manifestPath);
            } finally {
                InstallManifest.capture = capture;
            }
        });
    }
});

Deno.test('lock failure stops writes and late structural changes are rechecked', async () => {
    await fixture(async (_root, bundle, connector) => {
        await Deno.mkdir(connector.home);
        await Deno.writeTextFile(join(connector.home, '.~AGENTS.md.lock'), 'occupied');
        const result = await InstructionOperations.install(connector, bundle, options());
        expect((result.error as Error).cause).toBeInstanceOf(Deno.errors.AlreadyExists);
        expect(result.outcomes).toEqual([]);
        await missing(join(connector.home, 'AGENTS.md'));
        await missing(connector.manifestPath);
        expect(await Deno.readTextFile(join(connector.home, '.~AGENTS.md.lock'))).toBe('occupied');
        await Deno.writeTextFile(join(connector.home, 'protected'), 'old');
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('protected'), output('nested/file')]);
        const original = { ...Confirmation };
        try {
            Confirmation.available = (): boolean => true;
            Confirmation.ask = async (): Promise<boolean> => {
                await Deno.symlink(bundle, join(connector.home, 'nested'));
                return true;
            };
            const late = await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, nonInteractive: false }),
            );
            expect(late.error).toBeInstanceOf(Error);
            expect(late.outcomes).toEqual([{ path: 'protected', status: 'installed' }]);
            expect(
                (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                    file.path
                ),
            )
                .toEqual(['protected']);
            await missing(join(bundle, 'file'));
        } finally {
            Object.assign(Confirmation, original);
        }
    });
});

Deno.test('cancellation propagates after persisting completed writes', async () => {
    await fixture(async (_root, bundle, connector) => {
        const controller = new AbortController();
        controller.abort(new Error('cancelled'));
        await expect(
            InstructionOperations.install(
                connector,
                bundle,
                options({ signal: controller.signal }),
            ),
        ).rejects.toEqual(new Error('cancelled'));
        await missing(connector.home);
        const active = new AbortController();
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('a'), output('b')]);
        const capture = InstallManifest.capture;
        try {
            InstallManifest.capture = async (root, paths): ReturnType<typeof capture> => {
                const manifest = await capture(root, paths);
                active.abort(new Error('cancelled'));
                return manifest;
            };
            await expect(
                InstructionOperations.install(
                    connector,
                    bundle,
                    options({ signal: active.signal }),
                ),
            ).rejects.toEqual(new Error('cancelled'));
            expect(
                (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                    file.path
                ),
            )
                .toEqual(['a']);
            await missing(join(connector.home, 'b'));
        } finally {
            InstallManifest.capture = capture;
        }
    });
});

Deno.test('reinstall combines desired declines, obsolete ownership transfers and missing entries', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve(['obsolete/file', 'desired', 'absent/file', 'gone/file', 'safe/file']
                .map((path) => output(path)));
        expect((await InstructionOperations.install(connector, bundle, options())).error)
            .toBeUndefined();
        const baseline = await InstallManifest.load(connector.manifestPath);
        for (const path of ['obsolete/file', 'desired']) {
            await Deno.writeTextFile(join(connector.home, path), 'edit');
        }
        await Deno.remove(join(connector.home, 'absent/file'));
        await Deno.remove(join(connector.home, 'gone'), { recursive: true });
        await Deno.writeTextFile(join(connector.home, 'untracked'), 'user');
        await Deno.writeTextFile(join(connector.home, 'safe/user'), 'user');
        await Deno.mkdir(join(connector.home, 'unrelated'));
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([
                output('new/z'),
                output('desired'),
                output('untracked'),
                output('new/a'),
            ]);
        expect(
            await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, confirmation: 'no' }),
            ),
        ).toEqual({
            outcomes: [
                { path: 'new/z', status: 'installed' },
                { path: 'desired', status: 'skipped' },
                { path: 'untracked', status: 'skipped' },
                { path: 'new/a', status: 'installed' },
                { path: 'obsolete/file', status: 'skipped' },
                { path: 'absent/file', status: 'already-missing' },
                { path: 'gone/file', status: 'already-missing' },
                { path: 'safe/file', status: 'removed' },
            ],
        });
        const saved = await InstallManifest.load(connector.manifestPath);
        expect(saved?.files.map((file) => file.path)).toEqual(['desired', 'new/z', 'new/a']);
        expect(saved?.files[0]).toEqual(baseline?.files[1]);
        for (const path of ['obsolete/file', 'desired']) {
            expect(await Deno.readTextFile(join(connector.home, path))).toBe('edit');
        }
        for (const path of ['untracked', 'safe/user']) {
            expect(await Deno.readTextFile(join(connector.home, path))).toBe('user');
        }
        for (const path of ['absent', 'unrelated']) {
            expect((await Deno.lstat(join(connector.home, path))).isDirectory).toBe(true);
        }
    });
});

Deno.test('obsolete prompts share preflight with desired writes and fail before any mutation', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('safe/file'), output('obsolete')]);
        await InstructionOperations.install(connector, bundle, options());
        await Deno.writeTextFile(join(connector.home, 'obsolete'), 'edit');
        await Deno.writeTextFile(join(connector.home, 'untracked'), 'user');
        const baseline = await Deno.readTextFile(connector.manifestPath);
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('new/file'), output('untracked')]);
        const original = { ...Confirmation };
        const asked: string[] = [];
        try {
            Confirmation.available = (): boolean => false;
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, nonInteractive: false }),
                )).error,
            ).toBeInstanceOf(Error);
            Confirmation.available = (): boolean => true;
            Confirmation.ask = async (path, action): Promise<boolean> => {
                asked.push(path);
                await missing(join(connector.home, 'new'));
                expect(await Deno.readTextFile(join(connector.home, 'safe/file'))).toBe(
                    'safe/file',
                );
                expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
                if (path === 'obsolete') {
                    expect(action).toBe('Remove');
                    throw new Error('obsolete prompt');
                }
                return true;
            };
            expect(
                (await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, nonInteractive: false }),
                )).error,
            )
                .toEqual(new Error('obsolete prompt'));
            expect(asked).toEqual(['untracked', 'obsolete']);
            expect(await Deno.readTextFile(join(connector.home, 'untracked'))).toBe('user');
            expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
            Confirmation.ask = (): Promise<boolean> => Promise.resolve(true);
            const result = await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, nonInteractive: false }),
            );
            expect(result).toEqual({
                outcomes: [
                    { path: 'new/file', status: 'installed' },
                    { path: 'untracked', status: 'installed' },
                    { path: 'safe/file', status: 'removed' },
                    { path: 'obsolete', status: 'removed' },
                ],
            });
            await missing(join(connector.home, 'safe'));
        } finally {
            Object.assign(Confirmation, original);
        }
    });
});

Deno.test('empty translations reconcile all obsolete files and delete the manifest after cleanup', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('a/b/file'), output('a/other')]);
        await InstructionOperations.install(connector, bundle, options());
        await Deno.mkdir(join(connector.home, 'unrelated'));
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> => Promise.resolve([]);
        const remove = Deno.remove;
        const removed: string[] = [];
        try {
            Deno.remove = async (path, settings): Promise<void> => {
                expect(settings?.recursive).not.toBe(true);
                expect(await Deno.readTextFile(connector.manifestPath)).toContain('"files"');
                removed.push(String(path));
                await remove(path, settings);
            };
            expect(await InstructionOperations.install(connector, bundle, options())).toEqual({
                outcomes: ['a/b/file', 'a/other'].map((path) => ({ path, status: 'removed' })),
            });
        } finally {
            Deno.remove = remove;
        }
        expect(removed).toEqual(['a/b/file', 'a/other', 'a/b', 'a', 'manifest.json']
            .map((path) => join(connector.home, path)));
        expect((await Deno.lstat(join(connector.home, 'unrelated'))).isDirectory).toBe(true);
        await missing(connector.manifestPath);
        await InstallManifest.save(connector.manifestPath, { version: 1, files: [] });
        expect(await InstructionOperations.install(connector, bundle, options())).toEqual({
            outcomes: [],
        });
        await missing(connector.manifestPath);
    });
});

Deno.test('reinstall failures and cancellation persist completed writes and obsolete entry drops', async () => {
    for (const failure of ['write', 'remove', 'cleanup', 'cancel']) {
        await fixture(async (_root, bundle, connector) => {
            connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
                Promise.resolve(['old/file', 'later'].map((path) => output(path)));
            await InstructionOperations.install(connector, bundle, options());
            connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
                Promise.resolve([output('new'), output('second')]);
            const active = new AbortController();
            const remove = Deno.remove;
            const write = Fs.write;
            try {
                Fs.write = (path, content): Promise<void> => {
                    if (failure === 'write' && path.endsWith('/second')) throw new Error(failure);
                    return write(path, content);
                };
                Deno.remove = async (path, settings): Promise<void> => {
                    if (
                        String(path) ===
                            join(connector.home, failure === 'cleanup' ? 'old' : 'later') &&
                        (failure === 'remove' || failure === 'cleanup')
                    ) throw new Error(failure);
                    await remove(path, settings);
                    if (failure === 'cancel' && String(path).endsWith('/old/file')) {
                        active.abort(new Error('cancelled'));
                    }
                };
                const operation = InstructionOperations.install(
                    connector,
                    bundle,
                    options({ signal: active.signal }),
                );
                if (failure === 'cancel') {
                    await expect(operation).rejects.toEqual(new Error('cancelled'));
                } else {
                    const result = await operation;
                    expect((result.error as Error).cause).toEqual(new Error(failure));
                    expect(result.outcomes).toEqual([
                        { path: 'new', status: 'installed' },
                        ...(failure === 'write' ? [] : [
                            { path: 'second', status: 'installed' },
                            { path: 'old/file', status: 'removed' },
                            ...(failure === 'cleanup'
                                ? [{ path: 'later', status: 'removed' }]
                                : []),
                        ]),
                    ]);
                }
                expect(
                    (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                        file.path
                    ),
                )
                    .toEqual(
                        failure === 'write'
                            ? ['old/file', 'later', 'new']
                            : failure === 'cleanup'
                            ? ['new', 'second']
                            : ['later', 'new', 'second'],
                    );
                expect(await Deno.readTextFile(join(connector.home, 'new'))).toBe('new');
            } finally {
                Deno.remove = remove;
                Fs.write = write;
            }
        });
    }
});

Deno.test('declined desired-only reinstall leaves the saved baseline untouched', async () => {
    await fixture(async (_root, bundle, connector) => {
        await InstructionOperations.install(connector, bundle, options());
        const baseline = await Deno.readTextFile(connector.manifestPath);
        await Deno.writeTextFile(join(connector.home, 'AGENTS.md'), 'edit');
        const save = InstallManifest.save;
        try {
            InstallManifest.save = (): never => {
                throw new Error('unexpected save');
            };
            expect(
                await InstructionOperations.install(
                    connector,
                    bundle,
                    options({ force: true, confirmation: 'no' }),
                ),
            ).toEqual({
                outcomes: [{ path: 'AGENTS.md', status: 'skipped' }],
            });
            expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
        } finally {
            InstallManifest.save = save;
        }
    });
});

Deno.test('reinstall rejects a changed home before writing or removing', async () => {
    await fixture(async (root, bundle, connector) => {
        await InstructionOperations.install(connector, bundle, options());
        await Deno.writeTextFile(join(connector.home, 'AGENTS.md'), 'edit');
        const baseline = await Deno.readTextFile(connector.manifestPath);
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('new/file')]);
        const original = { ...Confirmation };
        try {
            Confirmation.available = (): boolean => true;
            Confirmation.ask = async (): Promise<boolean> => {
                await Deno.rename(connector.home, join(root, 'old'));
                await Deno.symlink(join(root, 'old'), connector.home);
                return true;
            };
            const result = await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, nonInteractive: false }),
            );
            expect((result.error as Error).cause).toEqual(new Error('Installation home changed'));
            expect(result.outcomes).toEqual([]);
            expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
            await missing(join(connector.home, 'new'));
        } finally {
            Object.assign(Confirmation, original);
        }
    });
});

Deno.test('obsolete declines and missing files alone persist ownership transfer without cleanup', async () => {
    await fixture(async (_root, bundle, connector) => {
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> =>
            Promise.resolve([output('declined/file'), output('missing/file')]);
        await InstructionOperations.install(connector, bundle, options());
        await Deno.writeTextFile(join(connector.home, 'declined/file'), 'edit');
        await Deno.remove(join(connector.home, 'missing/file'));
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> => Promise.resolve([]);
        expect(
            await InstructionOperations.install(
                connector,
                bundle,
                options({ force: true, confirmation: 'no' }),
            ),
        ).toEqual({
            outcomes: [
                { path: 'declined/file', status: 'skipped' },
                { path: 'missing/file', status: 'already-missing' },
            ],
        });
        await missing(connector.manifestPath);
        expect((await Deno.lstat(join(connector.home, 'missing'))).isDirectory).toBe(true);
        expect(await Deno.readTextFile(join(connector.home, 'declined/file'))).toBe('edit');
    });
});

Deno.test('empty reinstall reports repeated manifest deletion failures with completed removal outcomes', async () => {
    await fixture(async (_root, bundle, connector) => {
        await InstructionOperations.install(connector, bundle, options());
        connector.translateGlobalInstructions = (): Promise<ConnectorFile[]> => Promise.resolve([]);
        const remove = Deno.remove;
        let attempts = 0;
        try {
            Deno.remove = (path, settings): Promise<void> => {
                if (String(path) === connector.manifestPath) {
                    attempts++;
                    throw new Error('manifest');
                }
                return remove(path, settings);
            };
            const result = await InstructionOperations.install(connector, bundle, options());
            expect(result.error).toBeInstanceOf(AggregateError);
            expect((result.error as AggregateError).errors[1]).toEqual(new Error('manifest'));
            expect(attempts).toBe(2);
            expect(result.outcomes).toEqual([{ path: 'AGENTS.md', status: 'removed' }]);
            await missing(join(connector.home, 'AGENTS.md'));
        } finally {
            Deno.remove = remove;
        }
    });
});
