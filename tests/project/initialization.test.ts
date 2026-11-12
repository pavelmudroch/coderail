import { expect } from '@std/expect';
import { join } from '@std/path';

import { projectIgnoreLines, ProjectInitialization } from '../../src/project/initialization.ts';

Deno.test('initialization helpers cancel before I/O and after pending reads', async () => {
    const root = await Deno.makeTempDir();
    const read = Deno.readTextFile;
    const lstat = Deno.lstat;
    try {
        await Deno.mkdir(join(root, '.coderail'));
        for (const helper of [
            ProjectInitialization.ensureConfig,
            ProjectInitialization.ensureIgnoreRules,
        ]) {
            const controller = new AbortController();
            controller.abort(new Error('cancelled'));
            await expect(helper(root, controller.signal)).rejects.toThrow('cancelled');
        }
        for (const failure of [false, true]) {
            const controller = new AbortController();
            Deno.lstat = () => {
                controller.abort(new Error('cancelled stat'));
                return failure ? Promise.reject(new Deno.errors.NotFound()) : lstat(root);
            };
            await expect(
                ProjectInitialization.ensureConfig(root, controller.signal),
            ).rejects.toThrow();
            Deno.lstat = lstat;
            const ignoreController = new AbortController();
            Deno.readTextFile = () => {
                ignoreController.abort(new Error('cancelled read'));
                return failure ? Promise.reject(new Deno.errors.NotFound()) : Promise.resolve('*');
            };
            await expect(
                ProjectInitialization.ensureIgnoreRules(root, ignoreController.signal),
            ).rejects.toThrow('cancelled read');
            Deno.readTextFile = read;
        }
        await ProjectInitialization.ensureIgnoreRules(root, new AbortController().signal);
        expect(
            (await Deno.readTextFile(join(root, '.coderail', '.gitignore'))).trim().split('\n'),
        ).toEqual(projectIgnoreLines);
    } finally {
        Deno.readTextFile = read;
        Deno.lstat = lstat;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'shared initialization preserves configurations and repairs ignore rules idempotently',
    async () => {
        const root = await Deno.makeTempDir();
        const marker = join(root, '.coderail');
        const signal = new AbortController().signal;
        const config = join(marker, 'config');
        const ignore = join(marker, '.gitignore');
        try {
            await Deno.mkdir(marker);
            await ProjectInitialization.ensureConfig(root, signal);
            expect(await Deno.readTextFile(config)).toContain('# Coderail configuration file');
            await Deno.writeTextFile(config, 'custom config');
            await ProjectInitialization.ensureConfig(root, signal);
            expect(await Deno.readTextFile(config)).toBe('custom config');
            await Deno.remove(config);
            await Deno.mkdir(config);
            await expect(ProjectInitialization.ensureConfig(root, signal)).rejects.toThrow(
                'Expected',
            );
            await Deno.remove(config);
            await Deno.symlink(join(marker, 'absent'), config);
            await ProjectInitialization.ensureConfig(root, signal);
            expect((await Deno.lstat(config)).isSymlink).toBe(true);
            for (const original of [
                '',
                '# custom',
                '*\n!config\n',
                '*\r\n' + projectIgnoreLines.slice(1).join('\r\n'),
            ]) {
                await Deno.writeTextFile(ignore, original);
                await ProjectInitialization.ensureIgnoreRules(root, signal);
                const repaired = await Deno.readTextFile(ignore);
                expect(repaired.startsWith('*\n') || repaired.startsWith('*\r\n')).toBe(true);
                expect(
                    projectIgnoreLines.every((line) => repaired.split(/\r?\n/).includes(line)),
                ).toBe(true);
                expect(repaired).toContain(original);
                const before = await Deno.stat(ignore);
                await ProjectInitialization.ensureIgnoreRules(root, signal);
                expect(await Deno.stat(ignore)).toEqual(before);
                expect(await Deno.readTextFile(ignore)).toBe(repaired);
            }
            await Deno.remove(ignore);
            await Deno.mkdir(ignore);
            await expect(ProjectInitialization.ensureIgnoreRules(root, signal)).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'guarded initialization checks opened destinations and handles short writes',
    async () => {
        const root = await Deno.makeTempDir();
        const open = Deno.open;
        const signal = new AbortController().signal;
        const marker = join(root, '.coderail');
        const path = join(marker, '.gitignore');
        try {
            await Deno.mkdir(marker);
            for (const change of ['content', 'replacement', 'symlink', 'cancel', 'none']) {
                await Deno.writeTextFile(path, '# original');
                const controller = new AbortController();
                Deno.open = async (...args) => {
                    const file = await open(...args);
                    if (change === 'content') {
                        await Deno.writeTextFile(path, 'changed after opening');
                    } else if (change === 'replacement' || change === 'symlink') {
                        await Deno.rename(path, `${path}.old`);
                        if (change === 'symlink') {
                            await Deno.symlink(`${path}.old`, path);
                        } else {
                            await Deno.writeTextFile(path, '# original');
                        }
                    } else if (change === 'cancel') {
                        controller.abort(new Error('cancelled after opening'));
                    } else {
                        const write = file.writeSync.bind(file);
                        file.writeSync = (bytes) => write(bytes.subarray(0, 3));
                    }
                    return file;
                };
                const result = ProjectInitialization.ensureIgnoreRules(root, controller.signal, {
                    original: '# original',
                });
                if (change === 'none') {
                    await result;
                    expect(await Deno.readTextFile(path)).toContain('!tickets/**');
                } else {
                    await expect(result).rejects.toThrow(
                        change === 'cancel' ? 'cancelled' : 'changed',
                    );
                    expect(await Deno.readTextFile(path)).toBe(
                        change === 'content' ? 'changed after opening' : '# original',
                    );
                }
                Deno.open = open;
                await Deno.remove(path);
            }
            await ProjectInitialization.ensureConfig(root, signal, { original: undefined });
            expect(await Deno.readTextFile(join(marker, 'config'))).toContain(
                '# Coderail configuration',
            );
            await ProjectInitialization.ensureIgnoreRules(root, signal, { original: undefined });
            expect(await Deno.readTextFile(path)).toBe(projectIgnoreLines.join('\n') + '\n');
        } finally {
            Deno.open = open;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('initialize owns base setup and rejects cancellation before writes', async () => {
    const root = await Deno.makeTempDir();
    const options = {
        projectRoot: root,
        installRoot: root,
        names: [],
        mode: 'apply' as const,
        overwrite: 'error' as const,
        signal: new AbortController().signal,
    };
    try {
        for (const overrides of [{ signal: AbortSignal.abort() }]) {
            await expect(
                ProjectInitialization.initialize({ ...options, ...overrides }),
            ).rejects.toThrow();
            await expect(Deno.stat(join(root, '.coderail'))).rejects.toThrow();
        }
        expect(
            await ProjectInitialization.initialize({
                ...options,
                overwrite: () => Promise.resolve(false),
            }),
        ).toEqual({
            actions: [],
            conflicts: [],
        });
        expect(await Deno.readTextFile(join(root, '.coderail', 'config'))).toContain(
            '# Coderail configuration',
        );
        expect(await Deno.readTextFile(join(root, '.coderail', '.gitignore'))).toContain(
            '!tickets/**',
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('preview plans missing base files without creating a project', async () => {
    const root = await Deno.makeTempDir();
    try {
        const target = join(root, 'missing', 'project');
        const report = await ProjectInitialization.initialize({
            installRoot: root,
            projectRoot: target,
            names: [],
            mode: 'preview',
            overwrite: 'error',
            signal: new AbortController().signal,
        });
        expect(report.conflicts).toEqual([]);
        expect(report.actions).toEqual([
            { kind: 'copy', path: join(target, '.coderail', 'config') },
            { kind: 'copy', path: join(target, '.coderail', '.gitignore') },
        ]);
        await expect(Deno.stat(join(root, 'missing'))).rejects.toThrow();
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'preview preserves existing base files and validates a blocked base directory',
    async () => {
        const root = await Deno.makeTempDir();
        const options = {
            installRoot: root,
            projectRoot: root,
            names: [],
            mode: 'preview' as const,
            overwrite: 'error' as const,
            signal: new AbortController().signal,
        };
        try {
            const marker = join(root, '.coderail');
            await Deno.writeTextFile(marker, 'blocked');
            await expect(ProjectInitialization.initialize(options)).rejects.toThrow('Expected');
            await Deno.remove(marker);
            await Deno.mkdir(marker);
            await Deno.writeTextFile(join(marker, 'config'), 'no_color = true');
            await Deno.writeTextFile(join(marker, '.gitignore'), '# custom');
            const report = await ProjectInitialization.initialize(options);
            expect(report.actions).toEqual([{ kind: 'copy', path: join(marker, '.gitignore') }]);
            expect(await Deno.readTextFile(join(marker, 'config'))).toBe('no_color = true');
            expect(await Deno.readTextFile(join(marker, '.gitignore'))).toBe('# custom');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
