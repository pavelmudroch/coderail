import { expect } from '@std/expect';
import { dirname, join, parse } from '@std/path';

import { Project } from '../../../src/commands/doctor/project.ts';
import { projectIgnoreLines } from '../../../src/runtime/context.ts';

Deno.test(
    'project discovers the nearest marker and diagnoses incomplete initialization without mutations',
    async () => {
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        try {
            const marker = join(root, '.coderail');
            await Deno.mkdir(marker);
            const child = join(root, 'child');
            await Deno.mkdir(child);
            expect((await Project.discover(root, signal)).repositoryRoot).toBe(root);
            expect((await Project.discover(child, signal)).repositoryRoot).toBe(root);
            expect((await Project.check(root, signal)).failures).toHaveLength(2);
            expect(Array.from(Deno.readDirSync(marker))).toEqual([]);
            await Deno.writeTextFile(join(marker, 'config'), 'invalid = true');
            await Deno.writeTextFile(join(marker, '.gitignore'), projectIgnoreLines.join('\n'));
            expect((await Project.check(root, signal)).failures).toEqual([]);
            await Deno.writeTextFile(
                join(marker, '.gitignore'),
                [...projectIgnoreLines].reverse().join('\n'),
            );
            expect((await Project.check(root, signal)).failures).toHaveLength(1);
            await Deno.mkdir(join(child, '.coderail'));
            expect((await Project.discover(child, signal)).repositoryRoot).toBe(child);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'project handles filesystem root, discovery failures, read failures and cancellation',
    async () => {
        const stat = Deno.stat;
        const read = Deno.readTextFile;
        const signal = new AbortController().signal;
        const root = parse(Deno.cwd()).root;
        try {
            Deno.stat = (path) =>
                path === root ? stat(root) : Promise.reject(new Deno.errors.NotFound());
            expect(await Project.discover(root, signal)).toMatchObject({
                failures: [],
            });
            Deno.stat = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));
            const failed = await Project.discover(dirname(Deno.cwd()), signal);
            expect(failed.failures).toHaveLength(1);
            expect(failed.skipped.length).toBeGreaterThan(0);
            expect(failed.repositoryRoot).toBeUndefined();
            Deno.readTextFile = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));
            expect((await Project.check(root, signal)).failures).toHaveLength(1);
            const controller = new AbortController();
            Deno.stat = () => {
                controller.abort(new Error('cancelled'));
                return Promise.reject(new Deno.errors.PermissionDenied());
            };
            await expect(Project.discover(root, controller.signal)).rejects.toThrow('cancelled');
            await expect(Project.check(root, controller.signal)).rejects.toThrow('cancelled');
        } finally {
            Deno.stat = stat;
            Deno.readTextFile = read;
        }
    },
);

Deno.test('project reports invalid cwd and unreadable ancestor markers', async () => {
    const stat = Deno.stat;
    const root = parse(Deno.cwd()).root;
    const signal = new AbortController().signal;
    try {
        const directory = await stat(root);
        Deno.stat = () => Promise.resolve({ ...directory, isDirectory: false });
        expect((await Project.discover(root, signal)).failures[0]?.message).toContain(
            'not a directory',
        );
        Deno.stat = (path) =>
            path === root
                ? Promise.resolve(directory)
                : Promise.reject(new Deno.errors.PermissionDenied('marker'));
        expect((await Project.discover(root, signal)).failures[0]?.message).toContain('marker');
        Deno.stat = () => Promise.resolve({ ...directory, isDirectory: false });
        let first = true;
        Deno.stat = () => {
            const isDirectory = first;
            first = false;
            return Promise.resolve({ ...directory, isDirectory });
        };
        expect((await Project.discover(root, signal)).failures).toEqual([]);
    } finally {
        Deno.stat = stat;
    }
});

Deno.test(
    'project rejects unsupported ignore files before reading and accepts regular symlinks',
    async () => {
        const root = await Deno.makeTempDir();
        const read = Deno.readTextFile;
        try {
            const marker = join(root, '.coderail');
            await Deno.mkdir(marker);
            const ignore = join(marker, '.gitignore');
            await Deno.mkdir(ignore);
            Deno.readTextFile = () => {
                throw new Error('must not read unsupported input');
            };
            const report = await Project.check(root, new AbortController().signal);
            expect(report.failures).toHaveLength(2);
            expect(report.failures[1]?.message).toContain('expected a regular file');
            Deno.readTextFile = read;
            await Deno.remove(ignore);
            await Deno.writeTextFile(`${ignore}.real`, projectIgnoreLines.join('\n'));
            await Deno.symlink(`${ignore}.real`, ignore);
            await Deno.writeTextFile(join(marker, 'config'), '');
            expect((await Project.check(root, new AbortController().signal)).failures).toEqual([]);
        } finally {
            Deno.readTextFile = read;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'project checks local instructions for both harnesses independently of initialization',
    async () => {
        const { InstallManifest } = await import('@install-manifest');
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        try {
            for (const name of ['', '.claude']) {
                const home = join(root, name);
                await Deno.mkdir(home, { recursive: true });
                await Deno.writeTextFile(join(home, 'owned'), 'original');
                await InstallManifest.save(
                    join(home, '.coderail-install'),
                    await InstallManifest.capture(home, ['owned']),
                );
            }
            expect((await Project.check(root, signal)).failures).toHaveLength(2);
            await Deno.remove(join(root, 'owned'));
            await Deno.writeTextFile(join(root, '.claude', 'owned'), 'changed');
            const report = await Project.check(root, signal);
            expect(report.failures).toHaveLength(4);
            expect(report.failures.every((finding) => !finding.repairable)).toBe(true);
            expect(report.failures.map((finding) => finding.message).join('\n')).toContain(
                'missing',
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'configured executable checks use only PATH and never start harness sessions',
    async () => {
        const root = await Deno.makeTempDir();
        const previous = Deno.env.get('PATH');
        const signal = new AbortController().signal;
        try {
            Deno.env.set('PATH', root);
            expect((await Project.checkExecutable(undefined, signal)).skipped).toHaveLength(1);
            expect((await Project.checkExecutable('unknown', signal)).failures).toHaveLength(1);
            for (const name of ['codex', 'claude']) {
                expect((await Project.checkExecutable(name, signal)).failures).toHaveLength(1);
                const file = join(root, Deno.build.os === 'windows' ? `${name}.EXE` : name);
                await Deno.writeTextFile(file, 'must never execute this fixture', { mode: 0o755 });
                expect((await Project.checkExecutable(name, signal)).failures).toEqual([]);
                if (Deno.build.os !== 'windows') {
                    await Deno.chmod(file, 0o644);
                    expect((await Project.checkExecutable(name, signal)).failures).toHaveLength(1);
                }
                await Deno.remove(file);
            }
        } finally {
            if (previous === undefined) {
                Deno.env.delete('PATH');
            } else {
                Deno.env.set('PATH', previous);
            }
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'executable diagnostics cover platform PATH rules, unreadable candidates and cancellation',
    async () => {
        const original = { build: Deno.build, get: Deno.env.get, stat: Deno.stat };
        const info = await Deno.stat(Deno.execPath());
        const signal = new AbortController().signal;
        try {
            Object.defineProperty(Deno, 'build', {
                configurable: true,
                value: { ...original.build, os: 'windows' },
            });
            for (const pathext of [undefined, '.TEST']) {
                Deno.env.get = (name) => (name === 'PATHEXT' ? pathext : '/first;/second');
                const candidates: string[] = [];
                Deno.stat = (path) => {
                    candidates.push(String(path));
                    return Promise.resolve({ ...info, isFile: String(path).includes('/second/') });
                };
                expect((await Project.checkExecutable('claude', signal)).failures).toEqual([]);
                expect(candidates.every((path) => path.includes('claude'))).toBe(true);
                expect(candidates.at(-1)).toContain(pathext ?? '.COM');
            }
            Object.defineProperty(Deno, 'build', {
                configurable: true,
                value: { ...original.build, os: 'linux' },
            });
            Deno.env.get = () => undefined;
            for (const mode of [null, 0o644]) {
                Deno.stat = () => Promise.resolve({ ...info, isFile: true, mode });
                expect((await Project.checkExecutable('codex', signal)).failures).toHaveLength(1);
            }
            Deno.stat = () => Promise.reject(new Deno.errors.PermissionDenied('candidate denied'));
            expect((await Project.checkExecutable('codex', signal)).failures[0]?.message).toContain(
                'candidate denied',
            );
            const controller = new AbortController();
            Deno.stat = () => {
                controller.abort(new Error('cancelled executable'));
                return Promise.reject(new Deno.errors.PermissionDenied());
            };
            await expect(Project.checkExecutable('codex', controller.signal)).rejects.toThrow(
                'cancelled executable',
            );
            Deno.env.get = () => {
                throw new Deno.errors.PermissionDenied('PATH denied');
            };
            expect((await Project.checkExecutable('codex', signal)).failures[0]?.message).toContain(
                'PATH denied',
            );
        } finally {
            Object.defineProperty(Deno, 'build', { configurable: true, value: original.build });
            Deno.env.get = original.get;
            Deno.stat = original.stat;
        }
    },
);
