import { expect } from '@std/expect';
import { dirname, join } from '@std/path';

import {
    applyAssets,
    AssetApplyError,
    type AssetIO,
    DISTRIBUTION_MANIFEST,
    planAssets,
} from '../../../src/commands/upgrade/assets.ts';
import type { StagedDistribution } from '../../../src/commands/upgrade/distribution.ts';
import { InstallManifest, type Manifest } from '../../../src/install-manifest.ts';

async function put(root: string, path: string, value = 'release'): Promise<void> {
    await Deno.mkdir(dirname(join(root, path)), { recursive: true });
    await Deno.writeTextFile(join(root, path), value);
}
async function fixture(
    run: (root: string, stage: StagedDistribution) => Promise<void>,
): Promise<void> {
    const temp = await Deno.realPath(await Deno.makeTempDir());
    const root = join(temp, 'installation');
    const staging = join(temp, 'stage');
    try {
        await Deno.mkdir(root);
        await put(staging, 'instructions/a.md');
        await put(staging, 'templates/default.md');
        await put(staging, 'cr', 'binary');
        await run(root, {
            root: staging,
            executable: join(staging, 'cr'),
            instructions: join(staging, 'instructions'),
            templates: join(staging, 'templates'),
            build: { schemaVersion: 1, version: '1.0.0', commit: 'a'.repeat(40), target: 'test' },
        });
    } finally {
        await Deno.remove(temp, { recursive: true });
    }
}
async function manifest(root: string): Promise<Manifest> {
    const value = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
    if (!value) {
        throw new Error('Missing manifest');
    }
    return value;
}
const io: AssetIO = {
    async write(source, destination): Promise<void> {
        await Deno.mkdir(dirname(destination), { recursive: true });
        await Deno.copyFile(source, destination);
    },
    remove: Deno.remove,
    save: InstallManifest.save,
};

Deno.test(
    'bootstrap recognizes running binary and restores same-version missing assets',
    async () => {
        await fixture(async (root, stage) => {
            await put(root, 'libexec/cr-1.0.0', 'binary');
            await put(root, 'templates/personal.md', 'personal');
            const plan = await planAssets(root, stage, {
                runningExecutable: join(root, 'libexec/cr-1.0.0'),
            });
            expect(plan.bootstrap?.path).toBe('libexec/cr-1.0.0');
            await applyAssets(plan);
            expect((await manifest(root)).files.length).toBe(2);
            await Deno.remove(join(root, 'instructions/a.md'));
            await applyAssets(await planAssets(root, stage));
            expect(await Deno.readTextFile(join(root, 'instructions/a.md'))).toBe('release');
            expect(await Deno.readTextFile(join(root, 'templates/personal.md'))).toBe('personal');
        });
    },
);

Deno.test(
    'conflicts, noninteractive prompts and late unsafe paths never mutate installation',
    async () => {
        await fixture(async (root, stage) => {
            await put(root, 'templates/default.md', 'user');
            await expect(planAssets(root, stage)).rejects.toThrow('force');
            await expect(planAssets(root, stage, { force: true })).rejects.toThrow('interactive');
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe('user');
            await expect(Deno.stat(join(root, 'instructions'))).rejects.toThrow();
            await Deno.symlink(stage.instructions, join(root, 'instructions'));
            let prompts = 0;
            await expect(
                planAssets(root, stage, {
                    force: true,
                    interactive: true,
                    confirm: () => {
                        prompts++;
                        return true;
                    },
                }),
            ).rejects.toThrow('Unsafe');
            expect(prompts).toBe(0);
        });
    },
);

Deno.test(
    'declined untracked collisions remain unowned; yes claims only approved destinations',
    async () => {
        await fixture(async (root, stage) => {
            await put(root, 'templates/default.md', 'user');
            await applyAssets(await planAssets(root, stage, { force: true, no: true }));
            expect((await manifest(root)).files.map((file) => file.path)).toEqual([
                'instructions/a.md',
            ]);
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe('user');
            await applyAssets(await planAssets(root, stage, { force: true, yes: true }));
            expect((await manifest(root)).files.length).toBe(2);
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe('release');
        });
    },
);

Deno.test(
    'all per-file decisions precede writes; declined tracked overwrite/removal retain baselines',
    async () => {
        await fixture(async (root, stage) => {
            await applyAssets(await planAssets(root, stage));
            await put(root, 'templates/obsolete.md', 'baseline');
            const prior = await InstallManifest.capture(root, [
                'instructions/a.md',
                'templates/default.md',
                'templates/obsolete.md',
            ]);
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), prior);
            await put(stage.root, 'instructions/a.md', 'new instruction');
            await put(stage.root, 'templates/default.md', 'new template');
            await put(root, 'instructions/a.md', 'edited instruction');
            await put(root, 'templates/default.md', 'edited template');
            await put(root, 'templates/obsolete.md', 'edited obsolete');
            const decisions: string[] = [];
            const plan = await planAssets(root, stage, {
                force: true,
                interactive: true,
                async confirm(action): Promise<boolean> {
                    expect(await Deno.readTextFile(join(root, 'instructions/a.md'))).toBe(
                        'edited instruction',
                    );
                    decisions.push(action.file.path);
                    return action.file.path === 'templates/default.md';
                },
            });
            expect(decisions.length).toBe(3);
            await applyAssets(plan);
            const actual = await manifest(root);
            expect(actual.files.find((file) => file.path === 'instructions/a.md')).toEqual(
                prior.files.find((file) => file.path === 'instructions/a.md'),
            );
            expect(actual.files.find((file) => file.path === 'templates/obsolete.md')).toEqual(
                prior.files.find((file) => file.path === 'templates/obsolete.md'),
            );
            expect(actual.files.find((file) => file.path === 'templates/default.md')).not.toEqual(
                prior.files.find((file) => file.path === 'templates/default.md'),
            );
            expect(await Deno.readTextFile(join(root, 'templates/obsolete.md'))).toBe(
                'edited obsolete',
            );
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe(
                'new template',
            );
        });
    },
);

Deno.test(
    'unchanged obsolete files and verified missing entries are removed without directory deletion',
    async () => {
        await fixture(async (root, stage) => {
            await put(root, 'templates/old.md');
            await put(root, 'templates/missing.md');
            await put(root, 'templates/personal.md', 'personal');
            await InstallManifest.save(
                join(root, DISTRIBUTION_MANIFEST),
                await InstallManifest.capture(root, ['templates/old.md', 'templates/missing.md']),
            );
            await Deno.remove(join(root, 'templates/missing.md'));
            await applyAssets(await planAssets(root, stage));
            expect((await manifest(root)).files.length).toBe(2);
            await expect(Deno.stat(join(root, 'templates/old.md'))).rejects.toThrow();
            expect(await Deno.readTextFile(join(root, 'templates/personal.md'))).toBe('personal');
        });
    },
);

Deno.test('malformed and out-of-scope ownership and linked manifest fail preflight', async () => {
    await fixture(async (root, stage) => {
        for (const value of [
            '{',
            JSON.stringify({ version: 2, files: [] }),
            JSON.stringify({
                version: 1,
                files: [{ path: '../outside', checksum: 'a'.repeat(64), size: 1 }],
            }),
            JSON.stringify({
                version: 1,
                files: [{ path: 'personal', checksum: 'a'.repeat(64), size: 1 }],
            }),
        ]) {
            await put(root, DISTRIBUTION_MANIFEST, value);
            await expect(planAssets(root, stage)).rejects.toThrow();
            await expect(Deno.stat(join(root, 'instructions'))).rejects.toThrow();
        }
        await Deno.remove(join(root, DISTRIBUTION_MANIFEST));
        await Deno.symlink(stage.executable, join(root, DISTRIBUTION_MANIFEST));
        await expect(planAssets(root, stage)).rejects.toThrow('Unsafe');
    });
});

Deno.test(
    'write and removal failures persist completed progress and prevent successful return',
    async () => {
        for (const fail of ['write', 'remove']) {
            await fixture(async (root, stage) => {
                await put(root, 'templates/old.md');
                await InstallManifest.save(
                    join(root, DISTRIBUTION_MANIFEST),
                    await InstallManifest.capture(root, ['templates/old.md']),
                );
                let writes = 0;
                const plan = await planAssets(root, stage);
                try {
                    await applyAssets(plan, {
                        ...io,
                        async write(source, destination): Promise<void> {
                            if (fail === 'write' && writes++ === 1) {
                                throw new Error('write failure');
                            }
                            await io.write(source, destination);
                        },
                        async remove(path): Promise<void> {
                            if (fail === 'remove') {
                                throw new Error('remove failure');
                            }
                            await io.remove(path);
                        },
                    });
                    throw new Error('Expected application failure');
                } catch (error) {
                    expect(error).toBeInstanceOf(AssetApplyError);
                    const progress = (error as AssetApplyError).progress;
                    expect(progress.manifestSaved).toBe(true);
                    expect(progress.written.length).toBe(fail === 'write' ? 1 : 2);
                    const saved = await manifest(root);
                    expect(saved.files.some((file) => file.path === 'templates/old.md')).toBe(true);
                    expect(saved.files.length).toBe(progress.written.length + 1);
                }
            });
        }
    },
);

Deno.test('successful removals alone update ownership after a later removal fails', async () => {
    await fixture(async (root, stage) => {
        const paths = ['templates/first.md', 'templates/later.md', 'libexec/cr-old'];
        for (const path of paths) {
            await put(root, path);
        }
        const prior = await InstallManifest.capture(root, paths);
        await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), prior);
        const plan = await planAssets(root, stage);
        try {
            await applyAssets(plan, {
                ...io,
                async remove(path): Promise<void> {
                    if (path.endsWith('later.md')) {
                        throw new Error('remove failure');
                    }
                    await io.remove(path);
                },
            });
            throw new Error('Expected application failure');
        } catch (error) {
            expect(error).toBeInstanceOf(AssetApplyError);
            expect((error as AssetApplyError).progress).toEqual({
                written: ['instructions/a.md', 'templates/default.md'],
                removed: ['templates/first.md'],
                manifestSaved: true,
            });
        }
        const incoming = await InstallManifest.capture(root, [
            'instructions/a.md',
            'templates/default.md',
        ]);
        expect((await manifest(root)).files).toEqual([
            ...prior.files.filter((file) => file.path !== 'templates/first.md'),
            ...incoming.files,
        ]);
        await expect(Deno.stat(join(root, 'templates/first.md'))).rejects.toThrow();
        expect(await Deno.readTextFile(join(root, 'templates/later.md'))).toBe('release');
        expect(await Deno.readTextFile(join(root, 'libexec/cr-old'))).toBe('release');
    });
});

Deno.test('manifest-save failure exposes progress and blocks activation gate', async () => {
    await fixture(async (root, stage) => {
        let activated = false;
        try {
            await applyAssets(await planAssets(root, stage), {
                ...io,
                save: () => Promise.reject(new Error('save failure')),
            });
            activated = true;
        } catch (error) {
            expect(error).toBeInstanceOf(AssetApplyError);
            expect((error as AssetApplyError).progress).toEqual({
                written: ['instructions/a.md', 'templates/default.md'],
                removed: [],
                manifestSaved: false,
            });
        }
        expect(activated).toBe(false);
    });
});

Deno.test('missing prompt callback fails before mutation', async () => {
    await fixture(async (root, stage) => {
        await put(root, 'templates/default.md', 'user');
        await expect(planAssets(root, stage, { force: true, interactive: true })).rejects.toThrow(
            'interactive',
        );
    });
});

Deno.test('nested resources and executable ownership survive reconciliation', async () => {
    await fixture(async (root, stage) => {
        await put(stage.root, 'templates/nested/example.md');
        await put(root, 'libexec/cr-old', 'old binary');
        await InstallManifest.save(
            join(root, DISTRIBUTION_MANIFEST),
            await InstallManifest.capture(root, ['libexec/cr-old']),
        );
        await applyAssets(await planAssets(root, stage));
        expect((await manifest(root)).files.length).toBe(4);
        expect(await Deno.readTextFile(join(root, 'libexec/cr-old'))).toBe('old binary');
        expect(await Deno.readTextFile(join(root, 'templates/nested/example.md'))).toBe('release');
    });
});

Deno.test('unsafe directory and leaf types are rejected in installation and staging', async () => {
    await fixture(async (root, stage) => {
        await put(root, 'instructions', 'file');
        await expect(planAssets(root, stage)).rejects.toThrow('Unsafe');
        await Deno.remove(join(root, 'instructions'));
        await Deno.mkdir(join(root, 'instructions/a.md'), { recursive: true });
        await expect(planAssets(root, stage)).rejects.toThrow('Unsafe');
        await Deno.remove(join(root, 'instructions'), { recursive: true });
        await Deno.remove(stage.templates, { recursive: true });
        await Deno.symlink(stage.instructions, stage.templates);
        await expect(planAssets(root, stage)).rejects.toThrow('Unsafe staged');
        await Deno.remove(stage.templates);
        await put(stage.root, 'templates', 'file');
        await expect(planAssets(root, stage)).rejects.toThrow('Unsafe staged');
    });
});

Deno.test('bootstrap rejects outside paths and leaves mismatched binaries unclaimed', async () => {
    await fixture(async (root, stage) => {
        await put(root, 'libexec/cr-1', 'different');
        expect(
            (
                await planAssets(root, stage, {
                    runningExecutable: join(root, 'libexec/cr-1'),
                })
            ).bootstrap,
        ).toBeUndefined();
        await put(root, 'libexec/cr-1', 'binary');
        const baseline = await InstallManifest.capture(root, ['libexec/cr-1']);
        const first = baseline.files[0];
        if (!first) {
            throw new Error('Missing baseline');
        }
        first.size++;
        await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), baseline);
        expect(
            (
                await planAssets(root, stage, {
                    runningExecutable: join(root, 'libexec/cr-1'),
                })
            ).bootstrap,
        ).toBeUndefined();
        await Deno.remove(join(root, DISTRIBUTION_MANIFEST));
        const outside = join(dirname(root), 'installatioX', 'libexec/cr-1');
        await put(dirname(root), 'installatioX/libexec/cr-1', 'binary');
        await expect(planAssets(root, stage, { runningExecutable: outside })).rejects.toThrow();
    });
});

Deno.test(
    'checksum mismatch with unchanged size conflicts and tracked symlinks fail preflight',
    async () => {
        await fixture(async (root, stage) => {
            await applyAssets(await planAssets(root, stage));
            await put(root, 'instructions/a.md', 'changed');
            await expect(planAssets(root, stage)).rejects.toThrow('force');
            await Deno.remove(join(root, 'instructions/a.md'));
            await Deno.symlink(join(stage.instructions, 'a.md'), join(root, 'instructions/a.md'));
            let prompts = 0;
            await expect(
                planAssets(root, stage, {
                    force: true,
                    interactive: true,
                    confirm: () => {
                        prompts++;
                        return true;
                    },
                }),
            ).rejects.toThrow('Unsafe');
            expect(prompts).toBe(0);
        });
    },
);

Deno.test('size mismatch conflicts even when checksum baseline matches', async () => {
    await fixture(async (root, stage) => {
        await applyAssets(await planAssets(root, stage));
        const baseline = await manifest(root);
        const first = baseline.files[0];
        if (!first) {
            throw new Error('Missing baseline');
        }
        first.size++;
        await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), baseline);
        await expect(planAssets(root, stage)).rejects.toThrow('force');
    });
});

Deno.test(
    'defensive missing source and simultaneous mutation/save failure expose failures',
    async () => {
        await fixture(async (root, stage) => {
            const plan = await planAssets(root, stage);
            const first = plan.actions[0];
            if (!first) {
                throw new Error('Missing action');
            }
            first.source = undefined;
            await expect(applyAssets(plan)).rejects.toThrow('application failed');
            try {
                await applyAssets(plan, { ...io, save: () => Promise.reject(new Error('save')) });
                throw new Error('Expected failure');
            } catch (error) {
                expect(error).toBeInstanceOf(AssetApplyError);
                const cause = (error as Error).cause;
                expect(cause).toBeInstanceOf(AggregateError);
                expect(
                    (cause as AggregateError).errors.map((error: Error) => error.message),
                ).toEqual(['Missing staged source', 'save']);
            }
        });
    },
);

Deno.test('destination inspection errors propagate without mutation', async () => {
    await fixture(async (root, stage) => {
        const original = Deno.lstat;
        Deno.lstat = (path): Promise<Deno.FileInfo> => {
            if (String(path).endsWith(DISTRIBUTION_MANIFEST)) {
                return Promise.reject(new Deno.errors.PermissionDenied('inspection denied'));
            }
            return original(path);
        };
        try {
            await expect(planAssets(root, stage)).rejects.toThrow('inspection denied');
        } finally {
            Deno.lstat = original;
        }
    });
});

Deno.test(
    'modified obsolete removal requires force and affirmative per-file decision',
    async () => {
        await fixture(async (root, stage) => {
            await put(root, 'templates/old.md', 'baseline');
            await InstallManifest.save(
                join(root, DISTRIBUTION_MANIFEST),
                await InstallManifest.capture(root, ['templates/old.md']),
            );
            await put(root, 'templates/old.md', 'modified');
            await expect(planAssets(root, stage)).rejects.toThrow('force');
            await expect(
                planAssets(root, stage, {
                    force: true,
                    interactive: true,
                    confirm: () => {
                        throw new Error('prompt failed');
                    },
                }),
            ).rejects.toThrow('prompt failed');
            await expect(Deno.stat(join(root, 'instructions'))).rejects.toThrow();
            await applyAssets(await planAssets(root, stage, { force: true, yes: true }));
            expect(
                (await manifest(root)).files.some((file) => file.path === 'templates/old.md'),
            ).toBe(false);
            await expect(Deno.stat(join(root, 'templates/old.md'))).rejects.toThrow();
        });
    },
);

Deno.test(
    'empty incoming sets preserve personal files and reconcile managed baselines',
    async () => {
        for (const emptyDirectories of [false, true]) {
            await fixture(async (root, stage) => {
                await put(root, 'templates/personal.md', 'personal');
                for (const path of [stage.instructions, stage.templates]) {
                    await Deno.remove(path, { recursive: true });
                    if (emptyDirectories) {
                        await Deno.mkdir(path);
                    }
                }
                const first = await planAssets(root, stage);
                expect(first.actions).toEqual([]);
                await applyAssets(first);
                expect((await manifest(root)).files).toEqual([]);
                await put(root, 'instructions/old.md', 'baseline');
                await put(root, 'templates/edited.md', 'baseline');
                await put(root, 'templates/missing.md', 'baseline');
                const baseline = await InstallManifest.capture(root, [
                    'instructions/old.md',
                    'templates/edited.md',
                    'templates/missing.md',
                ]);
                await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), baseline);
                await put(root, 'templates/edited.md', 'edited');
                await Deno.remove(join(root, 'templates/missing.md'));
                await expect(planAssets(root, stage)).rejects.toThrow('force');
                await expect(planAssets(root, stage, { force: true })).rejects.toThrow(
                    'interactive',
                );
                await applyAssets(await planAssets(root, stage, { force: true, no: true }));
                expect((await manifest(root)).files).toEqual(
                    baseline.files.filter((file) => file.path === 'templates/edited.md'),
                );
                await expect(Deno.stat(join(root, 'instructions/old.md'))).rejects.toBeInstanceOf(
                    Deno.errors.NotFound,
                );
                expect(await Deno.readTextFile(join(root, 'templates/edited.md'))).toBe('edited');
                let prompts = 0;
                await applyAssets(
                    await planAssets(root, stage, {
                        force: true,
                        interactive: true,
                        confirm(action) {
                            prompts++;
                            expect(action.kind).toBe('remove');
                            expect(action.file.path).toBe('templates/edited.md');
                            return true;
                        },
                    }),
                );
                expect(prompts).toBe(1);
                expect((await manifest(root)).files).toEqual([]);
                await expect(Deno.stat(join(root, 'templates/edited.md'))).rejects.toBeInstanceOf(
                    Deno.errors.NotFound,
                );
                expect(await Deno.readTextFile(join(root, 'templates/personal.md'))).toBe(
                    'personal',
                );
            });
        }
    },
);

Deno.test('staged resource inspection errors are not treated as absent roots', async () => {
    await fixture(async (root, stage) => {
        const original = Deno.lstat;
        Deno.lstat = (path): Promise<Deno.FileInfo> => {
            if (String(path) === stage.instructions) {
                return Promise.reject(new Deno.errors.PermissionDenied('staged inspection denied'));
            }
            return original(path);
        };
        try {
            await expect(planAssets(root, stage)).rejects.toThrow('staged inspection denied');
            expect(Array.from(Deno.readDirSync(root))).toEqual([]);
        } finally {
            Deno.lstat = original;
        }
    });
});
