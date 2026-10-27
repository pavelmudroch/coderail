import { expect } from '@std/expect';
import { dirname, join } from '@std/path';
import type { HarnessConnector } from '../../src/harness/connector.ts';
import { InstallManifest } from '../../src/install-manifest.ts';
import { InstructionOperations, type OperationOptions } from '../../src/instruction-operations.ts';
import { Confirmation } from '../../src/instruction-operations/confirmation.ts';

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

async function fixture(
    paths: string[],
    run: (connector: HarnessConnector, root: string) => Promise<void>,
): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const home = join(root, 'home');
    const unexpected = (): never => {
        throw new Error('Uninstall must not translate');
    };
    const connector: HarnessConnector = {
        name: 'fake',
        home,
        manifestPath: join(home, 'manifest.json'),
        translateSkill: unexpected,
        translateGlobalInstructions: unexpected,
        translateSubagent: unexpected,
        [Symbol.dispose](): void {},
    };
    try {
        if (paths.length) {
            for (const path of paths) {
                await Deno.mkdir(dirname(join(home, path)), { recursive: true });
                await Deno.writeTextFile(join(home, path), path);
            }
            await InstallManifest.save(
                connector.manifestPath,
                await InstallManifest.capture(home, paths),
            );
        }
        await run(connector, root);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

Deno.test('uninstall removes only owned files in manifest order and cleans only deleted ancestors', async () => {
    await fixture(['a/b/file', 'a/other', 'kept/file', 'top'], async (connector) => {
        await Deno.mkdir(join(connector.home, 'unrelated'));
        await Deno.writeTextFile(join(connector.home, 'kept/user'), 'user');
        const remove = Deno.remove;
        const removed: string[] = [];
        try {
            Deno.remove = async (path, settings): Promise<void> => {
                expect(settings?.recursive).not.toBe(true);
                expect(await Deno.readTextFile(connector.manifestPath)).toContain('"files"');
                removed.push(String(path));
                await remove(path, settings);
            };
            expect(await InstructionOperations.uninstall(connector, options())).toEqual({
                outcomes: ['a/b/file', 'a/other', 'kept/file', 'top'].map((path) => ({
                    path,
                    status: 'removed',
                })),
            });
        } finally {
            Deno.remove = remove;
        }
        expect(removed).toEqual(
            ['a/b/file', 'a/other', 'kept/file', 'top', 'a/b', 'a', 'manifest.json'].map((path) =>
                join(connector.home, path)
            ),
        );
        await missing(join(connector.home, 'a'));
        await missing(connector.manifestPath);
        expect((await Deno.lstat(join(connector.home, 'unrelated'))).isDirectory).toBe(true);
        expect(await Deno.readTextFile(join(connector.home, 'kept/user'))).toBe('user');
    });
});

Deno.test('missing manifests do not create home; empty manifests are deleted last', async () => {
    await fixture([], async (connector) => {
        expect(await InstructionOperations.uninstall(connector, options())).toEqual({
            outcomes: [],
        });
        await missing(connector.home);
        await Deno.mkdir(connector.home);
        expect(await InstructionOperations.uninstall(connector, options())).toEqual({
            outcomes: [],
        });
        await InstallManifest.save(connector.manifestPath, { version: 1, files: [] });
        expect(await InstructionOperations.uninstall(connector, options())).toEqual({
            outcomes: [],
        });
        await missing(connector.manifestPath);
        expect((await Deno.lstat(connector.home)).isDirectory).toBe(true);
    });
});

Deno.test('modified files block whole harness; force yes removes equal-size and other edits', async () => {
    await fixture(['safe', 'equal', 'long'], async (connector) => {
        await Deno.writeTextFile(join(connector.home, 'equal'), 'EQUAL');
        await Deno.writeTextFile(join(connector.home, 'long'), 'long edit');
        const baseline = await Deno.readTextFile(connector.manifestPath);
        const blocked = await InstructionOperations.uninstall(connector, options());
        expect(blocked.error).toBeInstanceOf(Error);
        expect(blocked.outcomes).toEqual([]);
        expect(await Deno.readTextFile(join(connector.home, 'safe'))).toBe('safe');
        expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
        expect(
            await InstructionOperations.uninstall(
                connector,
                options({ force: true, confirmation: 'yes' }),
            ),
        ).toEqual({
            outcomes: ['safe', 'equal', 'long'].map((path) => ({ path, status: 'removed' })),
        });
        await missing(connector.manifestPath);
    });
});

Deno.test('declines transfer ownership and missing entries persist without byte changes or cleanup', async () => {
    await fixture(['declined/file', 'absent/file', 'leaf/file'], async (connector) => {
        await Deno.writeTextFile(join(connector.home, 'declined/file'), 'edit');
        await Deno.remove(join(connector.home, 'absent'), { recursive: true });
        await Deno.remove(join(connector.home, 'leaf/file'));
        const result = await InstructionOperations.uninstall(
            connector,
            options({ force: true, confirmation: 'no' }),
        );
        expect(result).toEqual({
            outcomes: [
                { path: 'declined/file', status: 'skipped' },
                { path: 'absent/file', status: 'already-missing' },
                { path: 'leaf/file', status: 'already-missing' },
            ],
        });
        expect(await Deno.readTextFile(join(connector.home, 'declined/file'))).toBe('edit');
        expect((await Deno.lstat(join(connector.home, 'leaf'))).isDirectory).toBe(true);
        await missing(connector.manifestPath);
    });
});

Deno.test('all conflicts and prompts resolve before mutation; prompt failures and terminal policy fail closed', async () => {
    await fixture(['safe', 'a', 'b'], async (connector) => {
        for (const path of ['a', 'b']) await Deno.writeTextFile(join(connector.home, path), 'edit');
        const original = { ...Confirmation };
        const asked: string[] = [];
        const baseline = await Deno.readTextFile(connector.manifestPath);
        try {
            Confirmation.available = (): boolean => false;
            expect(
                (await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, nonInteractive: false }),
                )).error,
            ).toBeInstanceOf(Error);
            Confirmation.available = (): boolean => true;
            expect(
                (await InstructionOperations.uninstall(connector, options({ force: true }))).error,
            ).toBeInstanceOf(Error);
            Confirmation.ask = async (path, action): Promise<boolean> => {
                asked.push(path);
                expect(action).toBe('Remove');
                expect(await Deno.readTextFile(join(connector.home, 'safe'))).toBe('safe');
                expect(await Deno.readTextFile(connector.manifestPath)).toBe(baseline);
                if (path === 'b') throw new Error('prompt');
                return true;
            };
            expect(
                (await InstructionOperations.uninstall(
                    connector,
                    options({ nonInteractive: false }),
                )).error,
            ).toBeInstanceOf(Error);
            expect(asked).toEqual([]);
            expect(
                (await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, nonInteractive: false }),
                )).error,
            ).toEqual(new Error('prompt'));
            expect(asked).toEqual(['a', 'b']);
            Confirmation.ask = (path): Promise<boolean> => Promise.resolve(path === 'a');
            expect(
                await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, nonInteractive: false }),
                ),
            ).toEqual({
                outcomes: [
                    { path: 'safe', status: 'removed' },
                    { path: 'a', status: 'removed' },
                    { path: 'b', status: 'skipped' },
                ],
            });
            expect(await Deno.readTextFile(join(connector.home, 'b'))).toBe('edit');
            await missing(connector.manifestPath);
        } finally {
            Object.assign(Confirmation, original);
        }
    });
});

Deno.test('unsafe manifests and entries fail closed even with force', async () => {
    for (
        const kind of [
            'malformed',
            'version',
            'reserved',
            'reserved-child',
            'escape',
            'duplicate',
            'collision',
            'directory',
            'symlink',
            'dangling',
        ]
    ) {
        await fixture(['safe'], async (connector, root) => {
            if (['directory', 'symlink', 'dangling'].includes(kind)) {
                await Deno.remove(connector.manifestPath);
                if (kind === 'directory') await Deno.mkdir(connector.manifestPath);
                else {await Deno.symlink(
                        kind === 'symlink' ? join(connector.home, 'safe') : join(root, 'missing'),
                        connector.manifestPath,
                    );}
            } else {
                const paths = kind === 'reserved'
                    ? ['manifest.json']
                    : kind === 'reserved-child'
                    ? ['manifest.json/child']
                    : kind === 'escape'
                    ? ['../home-sibling/file']
                    : kind === 'duplicate'
                    ? ['safe', 'safe']
                    : ['safe', 'safe/child'];
                await Deno.writeTextFile(
                    connector.manifestPath,
                    kind === 'malformed' ? '{' : JSON.stringify({
                        version: kind === 'version' ? 2 : 1,
                        files: paths.map((path) => ({
                            path,
                            size: 0,
                            checksum: 'a'.repeat(64),
                        })),
                    }),
                );
            }
            const result = await InstructionOperations.uninstall(
                connector,
                options({ force: true, confirmation: 'yes' }),
            );
            expect(result.error).toBeInstanceOf(Error);
            expect(result.outcomes).toEqual([]);
            expect(await Deno.readTextFile(join(connector.home, 'safe'))).toBe('safe');
        });
    }
});

Deno.test('unsafe leaves, ancestors and homes fail before removing safe entries', async () => {
    for (const kind of ['directory', 'symlink', 'dangling', 'ancestor-file', 'ancestor-link']) {
        await fixture(['safe', 'nested/file'], async (connector, root) => {
            await Deno.remove(join(connector.home, 'nested'), { recursive: true });
            if (kind.startsWith('ancestor')) {
                if (kind === 'ancestor-file') {
                    await Deno.writeTextFile(join(connector.home, 'nested'), 'file');
                } else await Deno.symlink(root, join(connector.home, 'nested'));
            } else {
                await Deno.mkdir(join(connector.home, 'nested'));
                if (kind === 'directory') await Deno.mkdir(join(connector.home, 'nested/file'));
                else {await Deno.symlink(
                        kind === 'symlink' ? join(connector.home, 'safe') : join(root, 'missing'),
                        join(connector.home, 'nested/file'),
                    );}
            }
            expect(
                (await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, confirmation: 'yes' }),
                )).error,
            ).toBeInstanceOf(Error);
            expect(await Deno.readTextFile(join(connector.home, 'safe'))).toBe('safe');
        });
    }
    await fixture(['safe'], async (connector, root) => {
        for (
            const locations of [{ home: 'relative' }, { manifestPath: 'relative' }, {
                manifestPath: join(root, 'home-sibling', 'manifest.json'),
            }]
        ) {
            expect(
                (await InstructionOperations.uninstall({ ...connector, ...locations }, options()))
                    .error,
            ).toBeInstanceOf(Error);
        }
        const alias = join(root, 'alias');
        await Deno.symlink(connector.home, alias);
        expect(
            (await InstructionOperations.uninstall({
                ...connector,
                home: alias,
                manifestPath: join(alias, 'manifest.json'),
            }, options())).error,
        ).toBeUndefined();
        await missing(join(connector.home, 'safe'));
    });
});

Deno.test('delete and cleanup failures stop execution and save completed entry drops', async () => {
    for (const failure of ['delete', 'cleanup']) {
        await fixture(['first/file', 'second', 'third'], async (connector) => {
            const remove = Deno.remove;
            try {
                Deno.remove = (path, settings): Promise<void> => {
                    if (
                        String(path) ===
                            join(connector.home, failure === 'delete' ? 'second' : 'first')
                    ) throw new Error(failure);
                    return remove(path, settings);
                };
                const result = await InstructionOperations.uninstall(connector, options());
                expect((result.error as Error).cause).toEqual(new Error(failure));
                expect(result.outcomes).toEqual(
                    (failure === 'delete' ? ['first/file'] : ['first/file', 'second', 'third']).map(
                        (path) => ({ path, status: 'removed' }),
                    ),
                );
                if (failure === 'delete') {
                    expect(
                        (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                            file.path
                        ),
                    ).toEqual(['second', 'third']);
                    expect(await Deno.readTextFile(join(connector.home, 'third'))).toBe('third');
                } else await missing(connector.manifestPath);
                expect((await Deno.lstat(join(connector.home, 'first'))).isDirectory).toBe(true);
            } finally {
                Deno.remove = remove;
            }
        });
    }
});

Deno.test('partial ownership transfer and missing-entry drops persist after a later failure', async () => {
    await fixture(['declined/file', 'missing/file', 'failed', 'later'], async (connector) => {
        await Deno.writeTextFile(join(connector.home, 'declined/file'), 'edit');
        await Deno.remove(join(connector.home, 'missing/file'));
        const remove = Deno.remove;
        try {
            Deno.remove = (path, settings): Promise<void> => {
                if (String(path).endsWith('/failed')) throw new Error('delete');
                return remove(path, settings);
            };
            const result = await InstructionOperations.uninstall(
                connector,
                options({ force: true, confirmation: 'no' }),
            );
            expect(result.error).toBeInstanceOf(Error);
            expect(result.outcomes).toEqual([{ path: 'declined/file', status: 'skipped' }, {
                path: 'missing/file',
                status: 'already-missing',
            }]);
            expect(
                (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                    file.path
                ),
            ).toEqual(['failed', 'later']);
            expect((await Deno.lstat(join(connector.home, 'missing'))).isDirectory).toBe(true);
            expect(await Deno.readTextFile(join(connector.home, 'declined/file'))).toBe('edit');
        } finally {
            Deno.remove = remove;
        }
    });
});

Deno.test('operation and persistence failures are both reported with completed outcomes', async () => {
    await fixture(['a', 'b'], async (connector) => {
        const remove = Deno.remove;
        const save = InstallManifest.save;
        try {
            Deno.remove = (path, settings): Promise<void> => {
                if (String(path).endsWith('/b')) throw new Error('delete');
                return remove(path, settings);
            };
            InstallManifest.save = (): never => {
                throw new Error('save');
            };
            const result = await InstructionOperations.uninstall(connector, options());
            expect(result.error).toBeInstanceOf(AggregateError);
            expect(((result.error as AggregateError).errors[0] as Error).cause).toEqual(
                new Error('delete'),
            );
            expect((result.error as AggregateError).errors[1]).toEqual(new Error('save'));
            expect(result.outcomes).toEqual([{ path: 'a', status: 'removed' }]);
        } finally {
            Deno.remove = remove;
            InstallManifest.save = save;
        }
    });
});

Deno.test('manifest deletion failure retries persistence and preserves completed outcomes', async () => {
    await fixture(['file'], async (connector) => {
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
            const result = await InstructionOperations.uninstall(connector, options());
            expect(result.error).toBeInstanceOf(AggregateError);
            expect(attempts).toBe(2);
            expect(result.outcomes).toEqual([{ path: 'file', status: 'removed' }]);
            await missing(join(connector.home, 'file'));
        } finally {
            Deno.remove = remove;
        }
    });
});

Deno.test('cancellation propagates before work and after best-effort persistence', async () => {
    await fixture(['a', 'b'], async (connector) => {
        const controller = new AbortController();
        controller.abort(new Error('cancelled'));
        await expect(
            InstructionOperations.uninstall(connector, options({ signal: controller.signal })),
        ).rejects.toEqual(new Error('cancelled'));
        const active = new AbortController();
        const remove = Deno.remove;
        try {
            Deno.remove = async (path, settings): Promise<void> => {
                await remove(path, settings);
                if (String(path).endsWith('/a')) active.abort(new Error('cancelled'));
            };
            await expect(
                InstructionOperations.uninstall(connector, options({ signal: active.signal })),
            ).rejects.toEqual(new Error('cancelled'));
            expect(
                (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                    file.path
                ),
            ).toEqual(['b']);
            expect(await Deno.readTextFile(join(connector.home, 'b'))).toBe('b');
        } finally {
            Deno.remove = remove;
        }
    });
});

Deno.test('late structural changes and access failures stop removal without treating them as absence', async () => {
    for (const kind of ['leaf', 'ancestor', 'home', 'access']) {
        await fixture(['prompt', 'nested/file', 'later'], async (connector, root) => {
            await Deno.writeTextFile(join(connector.home, 'prompt'), 'edit');
            const original = { ...Confirmation };
            const lstat = Deno.lstat;
            try {
                Confirmation.available = (): boolean => true;
                Confirmation.ask = async (): Promise<boolean> => {
                    if (kind === 'home') {
                        await Deno.rename(connector.home, join(root, 'old'));
                        await Deno.symlink(join(root, 'old'), connector.home);
                    } else if (kind === 'access') {
                        Deno.lstat = (path): ReturnType<typeof lstat> => {
                            if (String(path).endsWith('/nested/file')) {
                                throw new Deno.errors.PermissionDenied('access');
                            }
                            return lstat(path);
                        };
                    } else {
                        await Deno.remove(join(connector.home, 'nested'), { recursive: true });
                        if (kind === 'ancestor') {
                            await Deno.symlink(root, join(connector.home, 'nested'));
                        } else {
                            await Deno.mkdir(join(connector.home, 'nested'));
                            await Deno.mkdir(join(connector.home, 'nested/file'));
                        }
                    }
                    return true;
                };
                const result = await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, nonInteractive: false }),
                );
                expect(result.error).toBeInstanceOf(Error);
                expect(result.outcomes).toEqual(
                    kind === 'home' ? [] : [{ path: 'prompt', status: 'removed' }],
                );
                expect(await Deno.readTextFile(join(connector.home, 'later'))).toBe('later');
                if (kind !== 'home') {
                    expect(
                        (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                            file.path
                        ),
                    ).toEqual(['nested/file', 'later']);
                }
            } finally {
                Deno.lstat = lstat;
                Object.assign(Confirmation, original);
            }
        });
    }
});

Deno.test('cleanup rechecks directory types and propagates read errors while preserving completed drops', async () => {
    for (const kind of ['symlink', 'file', 'access']) {
        await fixture(['nested/file'], async (connector, root) => {
            const remove = Deno.remove;
            const readDir = Deno.readDir;
            try {
                Deno.remove = async (path, settings): Promise<void> => {
                    await remove(path, settings);
                    if (String(path).endsWith('/nested/file')) {
                        if (kind === 'access') {
                            Deno.readDir = (): never => {
                                throw new Deno.errors.PermissionDenied('cleanup');
                            };
                        } else {
                            await remove(join(connector.home, 'nested'));
                            if (kind === 'symlink') {
                                await Deno.symlink(root, join(connector.home, 'nested'));
                            } else await Deno.writeTextFile(join(connector.home, 'nested'), 'user');
                        }
                    }
                };
                const result = await InstructionOperations.uninstall(connector, options());
                expect(result.error).toBeInstanceOf(Error);
                expect(result.outcomes).toEqual([{ path: 'nested/file', status: 'removed' }]);
                await missing(connector.manifestPath);
                expect(await Deno.lstat(join(connector.home, 'nested'))).toBeDefined();
            } finally {
                Deno.remove = remove;
                Deno.readDir = readDir;
            }
        });
    }
});

Deno.test('late disappearance reports absence; no completed actions means no persistence attempt', async () => {
    await fixture(['file'], async (connector) => {
        const original = { ...Confirmation };
        try {
            await Deno.writeTextFile(join(connector.home, 'file'), 'edit');
            Confirmation.available = (): boolean => true;
            Confirmation.ask = async (): Promise<boolean> => {
                await Deno.remove(join(connector.home, 'file'));
                return false;
            };
            expect(
                await InstructionOperations.uninstall(
                    connector,
                    options({ force: true, nonInteractive: false }),
                ),
            ).toEqual({ outcomes: [{ path: 'file', status: 'already-missing' }] });
        } finally {
            Object.assign(Confirmation, original);
        }
    });
    await fixture(['file'], async (connector) => {
        const remove = Deno.remove;
        const save = InstallManifest.save;
        try {
            Deno.remove = (): never => {
                throw new Error('delete');
            };
            InstallManifest.save = (): never => {
                throw new Error('unexpected save');
            };
            const result = await InstructionOperations.uninstall(connector, options());
            expect(result.error).not.toBeInstanceOf(AggregateError);
            expect((result.error as Error).cause).toEqual(new Error('delete'));
            expect(result.outcomes).toEqual([]);
            expect(
                (await InstallManifest.load(connector.manifestPath))?.files.map((file) =>
                    file.path
                ),
            ).toEqual(['file']);
        } finally {
            Deno.remove = remove;
            InstallManifest.save = save;
        }
    });
});

Deno.test('cleanup visits deepest directories first and stops branches at nonempty parents', async () => {
    await fixture(['a/one/file', 'b/two/three/file', 'kept/deep/file'], async (connector) => {
        await Deno.writeTextFile(join(connector.home, 'kept/deep/user'), 'user');
        const remove = Deno.remove;
        const readDir = Deno.readDir;
        const directories: string[] = [];
        try {
            Deno.remove = (path, settings): Promise<void> => {
                if (
                    ['a/one', 'a', 'b/two/three', 'b/two', 'b'].some((directory) =>
                        join(connector.home, directory) === String(path)
                    )
                ) directories.push(String(path));
                return remove(path, settings);
            };
            Deno.readDir = (path): ReturnType<typeof readDir> => {
                expect(String(path)).not.toBe(join(connector.home, 'kept'));
                return readDir(path);
            };
            expect((await InstructionOperations.uninstall(connector, options())).error)
                .toBeUndefined();
            expect(directories).toEqual(
                ['b/two/three', 'a/one', 'b/two', 'a', 'b'].map((path) =>
                    join(connector.home, path)
                ),
            );
            expect(await Deno.readTextFile(join(connector.home, 'kept/deep/user'))).toBe('user');
        } finally {
            Deno.remove = remove;
            Deno.readDir = readDir;
        }
    });
});

Deno.test('cancellation during cleanup persists empty ownership and leaves further cleanup unfinished', async () => {
    await fixture(['a/b/file'], async (connector) => {
        const active = new AbortController();
        const remove = Deno.remove;
        try {
            Deno.remove = async (path, settings): Promise<void> => {
                await remove(path, settings);
                if (String(path) === join(connector.home, 'a/b')) {
                    active.abort(new Error('cancelled'));
                }
            };
            await expect(
                InstructionOperations.uninstall(connector, options({ signal: active.signal })),
            ).rejects.toEqual(new Error('cancelled'));
            await missing(connector.manifestPath);
            expect((await Deno.lstat(join(connector.home, 'a'))).isDirectory).toBe(true);
        } finally {
            Deno.remove = remove;
        }
    });
});

Deno.test('cancellation still propagates when best-effort persistence fails', async () => {
    await fixture(['a', 'b'], async (connector) => {
        const active = new AbortController();
        const remove = Deno.remove;
        const save = InstallManifest.save;
        let attempted = false;
        try {
            Deno.remove = async (path, settings): Promise<void> => {
                await remove(path, settings);
                active.abort(new Error('cancelled'));
            };
            InstallManifest.save = (): never => {
                attempted = true;
                throw new Error('save');
            };
            await expect(
                InstructionOperations.uninstall(connector, options({ signal: active.signal })),
            ).rejects.toEqual(new Error('cancelled'));
            expect(attempted).toBe(true);
            await missing(join(connector.home, 'a'));
            expect(await Deno.readTextFile(join(connector.home, 'b'))).toBe('b');
        } finally {
            Deno.remove = remove;
            InstallManifest.save = save;
        }
    });
});
