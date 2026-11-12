import { InstallManifest } from '@install-manifest';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { Installation } from '../../../src/commands/doctor/installation.ts';
import { windowsLauncher } from '../../../src/installation/activation.ts';
import { DISTRIBUTION_MANIFEST } from '../../../src/installation/assets.ts';

Deno.test({
    name: 'installation rejects FIFO resources without opening them and continues independent checks',
    ignore: Deno.build.os === 'windows',
    async fn() {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const original = { open: Deno.open, readFile: Deno.readFile };
        const opened: string[] = [];
        const reads: string[] = [];
        try {
            await Deno.mkdir(join(root, 'libexec'));
            const entryPath = join(root, 'libexec', 'cr-1');
            await Deno.writeTextFile(entryPath, 'binary');
            await Deno.mkdir(join(root, 'instructions'));
            await Deno.mkdir(join(root, 'templates'));
            const fifo = join(root, 'instructions', 'fifo');
            const readable = join(root, 'templates', 'readable');
            await Deno.writeTextFile(readable, 'text');
            expect((await new Deno.Command('mkfifo', { args: [fifo] }).output()).success).toBe(
                true,
            );
            Deno.open = (path, options) => {
                if (path === fifo) {
                    opened.push(fifo);
                    throw new Error('FIFO must never be opened');
                }
                return original.open(path, options);
            };
            Deno.readFile = (path, options) => {
                if (path === fifo) {
                    opened.push(fifo);
                    throw new Error('FIFO must never be read');
                }
                reads.push(String(path));
                return original.readFile(path, options);
            };
            const report = await Installation.check(new AbortController().signal, {
                entryPath,
                standalone: true,
                windows: false,
                path: '',
            });
            expect(opened).toEqual([]);
            expect(reads).toContain(readable);
            expect(report.failures).toHaveLength(4);
            expect(report.failures[0]?.message).toBe(
                `Resource ${fifo}: Error: Unsupported resource entry type`,
            );
            expect(report.failures[1]?.message).toContain('Distribution manifest:');
            expect(report.failures[2]?.message).toContain('Launcher:');
            expect(report.failures[3]?.message).toContain('PATH:');
            expect(report.skipped).toEqual(['Owned files: distribution manifest unavailable.']);
        } finally {
            Deno.open = original.open;
            Deno.readFile = original.readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
});

Deno.test({
    name: 'installation rejects a FIFO manifest and continues independent checks without opening it',
    ignore: Deno.build.os === 'windows',
    async fn() {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const open = Deno.open;
        const readTextFile = Deno.readTextFile;
        const stat = Deno.stat;
        const controller = new AbortController();
        try {
            await Deno.mkdir(join(root, 'libexec'));
            const entryPath = join(root, 'libexec', 'cr-1');
            await Deno.writeTextFile(entryPath, 'binary');
            const manifestPath = join(root, DISTRIBUTION_MANIFEST);
            const result = await new Deno.Command('mkfifo', { args: [manifestPath] }).output();
            expect(result.success).toBe(true);
            // Fail immediately if the stream loader regresses to opening the FIFO.
            Deno.open = (path, options) => {
                expect(path).not.toBe(manifestPath);
                return open(path, options);
            };
            Deno.readTextFile = (path, options) => {
                expect(path).not.toBe(manifestPath);
                return readTextFile(path, options);
            };
            const settings = { entryPath, standalone: true, windows: false, path: '' };
            const report = await Installation.check(controller.signal, settings);
            expect(report.failures.map((failure) => failure.message)).toEqual([
                'Distribution manifest: Error: Distribution manifest must be a regular file',
                'Launcher: Error: Missing or broken installation launcher',
                `PATH: Error: Installation bin "${join(root, 'bin')}" is absent from PATH`,
            ]);
            expect(report.skipped).toEqual(['Owned files: distribution manifest unavailable.']);
            expect((await stat(manifestPath)).isFifo).toBe(true);
            Deno.stat = async (path) => {
                const info = await stat(path);
                if (path === manifestPath) {
                    controller.abort(new Error('cancelled during manifest metadata'));
                }
                return info;
            };
            await expect(Installation.check(controller.signal, settings)).rejects.toThrow(
                'cancelled during manifest metadata',
            );
        } finally {
            Deno.open = open;
            Deno.readTextFile = readTextFile;
            Deno.stat = stat;
            await Deno.remove(root, { recursive: true });
        }
    },
});

Deno.test('installation propagates cancellation during the manifest read', async () => {
    using _homes = isolateHarnessHomes();
    const root = await Deno.realPath(await Deno.makeTempDir());
    const readTextFile = Deno.readTextFile;
    const controller = new AbortController();
    try {
        await Deno.mkdir(join(root, 'libexec'));
        const entryPath = join(root, 'libexec', 'cr-1');
        await Deno.writeTextFile(entryPath, 'binary');
        const manifestPath = join(root, DISTRIBUTION_MANIFEST);
        await InstallManifest.save(manifestPath, { version: 1, files: [] });
        Deno.readTextFile = (path, options) => {
            expect(path).toBe(manifestPath);
            expect(options?.signal).toBe(controller.signal);
            return new Promise((_resolve, reject) => {
                controller.signal.addEventListener(
                    'abort',
                    () => reject(controller.signal.reason),
                    {
                        once: true,
                    },
                );
                controller.abort(new Error('cancelled during manifest read'));
            });
        };
        await expect(
            Installation.check(controller.signal, {
                entryPath,
                standalone: true,
                windows: false,
                path: '',
            }),
        ).rejects.toThrow('cancelled during manifest read');
    } finally {
        Deno.readTextFile = readTextFile;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'installation checks source and compiled layouts read only and accumulates failures',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const signal = new AbortController().signal;
        const entry = join(root, 'libexec', 'cr-1.exe');
        const settings = {
            standalone: true,
            entryPath: entry,
            path: join(root, 'bin'),
            windows: true,
        };
        try {
            await Deno.mkdir(join(root, 'libexec'));
            await Deno.mkdir(join(root, 'bin'));
            await Deno.writeTextFile(entry, 'binary');
            await Deno.writeTextFile(join(root, 'bin', 'cr.cmd'), windowsLauncher('cr-1.exe'));
            await InstallManifest.save(
                join(root, DISTRIBUTION_MANIFEST),
                await InstallManifest.capture(root, ['libexec/cr-1.exe']),
            );
            expect(await Installation.check(signal, settings)).toEqual({
                failures: [],
                skipped: [],
            });
            const source = await Installation.check(signal, { ...settings, standalone: false });
            expect(source.failures).toEqual([]);
            expect(source.skipped).toHaveLength(3);
            await Deno.mkdir(join(root, 'assets'));
            await Deno.mkdir(join(root, 'assets', 'instructions'));
            await Deno.writeTextFile(join(root, 'assets', 'instructions', 'a'), 'readable');
            expect(
                (await Installation.check(signal, { ...settings, standalone: false })).failures,
            ).toEqual([]);
            await Deno.writeTextFile(join(root, 'assets', 'templates'), 'invalid directory');
            expect(
                (await Installation.check(signal, { ...settings, standalone: false })).failures,
            ).toHaveLength(1);
            await Deno.writeTextFile(entry, 'changed');
            await Deno.writeTextFile(join(root, 'bin', 'cr.cmd'), 'broken');
            let report = await Installation.check(signal, { ...settings, path: '' });
            expect(report.failures).toHaveLength(3);
            expect(
                report.failures.every(
                    (failure) => !failure.repairable && failure.manualRepair.length > 0,
                ),
            ).toBe(true);
            expect(await Deno.readTextFile(entry)).toBe('changed');
            await Deno.remove(entry);
            // Keep a resolvable entry point while checking missing owned files.
            const other = join(root, 'libexec', 'cr-2.exe');
            await Deno.writeTextFile(other, 'other');
            report = await Installation.check(signal, { ...settings, entryPath: other });
            expect(report.failures.some((failure) => failure.message.includes('missing'))).toBe(
                true,
            );
            await Deno.writeTextFile(join(root, DISTRIBUTION_MANIFEST), '{bad');
            report = await Installation.check(signal, { ...settings, entryPath: other });
            expect(report.skipped).toContain('Owned files: distribution manifest unavailable.');
            await Deno.remove(join(root, DISTRIBUTION_MANIFEST));
            expect(
                (await Installation.check(signal, { ...settings, entryPath: other })).failures[0]
                    ?.message,
            ).toContain('manifest');
            report = await Installation.check(signal, settings);
            expect(report.failures).toHaveLength(1);
            expect(report.skipped.length).toBeGreaterThan(0);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'installation propagates cancellation and continues after individual inspection errors',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const original = InstallManifest.inspect;
        const controller = new AbortController();
        try {
            await Deno.mkdir(join(root, 'libexec'));
            const entryPath = join(root, 'libexec', 'cr-1');
            await Deno.writeTextFile(entryPath, 'binary');
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), {
                version: 1,
                files: [
                    { path: 'templates/unreadable', checksum: '0'.repeat(64), size: 0 },
                    { path: 'instructions/missing', checksum: '0'.repeat(64), size: 0 },
                ],
            });
            InstallManifest.inspect = (root, manifest) => {
                if (manifest.files[0]?.path === 'templates/unreadable') {
                    throw new Deno.errors.PermissionDenied('denied');
                }
                return original(root, manifest);
            };
            const report = await Installation.check(controller.signal, {
                standalone: true,
                entryPath,
                windows: false,
                path: '',
            });
            expect(report.failures).toHaveLength(4);
            expect(report.failures.map((failure) => failure.message).join('\n')).toContain(
                'denied',
            );
            controller.abort(new Error('cancelled'));
            await expect(Installation.check(controller.signal)).rejects.toThrow('cancelled');
        } finally {
            InstallManifest.inspect = original;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'installation reads nested resources and reports permission errors with independent checks',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const original = { lstat: Deno.lstat, readFile: Deno.readFile };
        try {
            await Deno.mkdir(join(root, 'src'));
            const entryPath = join(root, 'src', 'main.ts');
            await Deno.writeTextFile(entryPath, 'entry');
            await Deno.mkdir(join(root, 'assets', 'instructions', 'nested'), { recursive: true });
            const resource = join(root, 'assets', 'instructions', 'nested', 'file');
            await Deno.writeTextFile(resource, 'text');
            const settings = { entryPath, standalone: false, windows: false, path: '' };
            expect(
                (await Installation.check(new AbortController().signal, settings)).failures,
            ).toEqual([]);
            Deno.lstat = (path) => {
                if (path === join(root, 'assets', 'templates')) {
                    throw new Deno.errors.PermissionDenied('templates denied');
                }
                return original.lstat(path);
            };
            Deno.readFile = (path, options) => {
                if (path === resource) {
                    throw new Deno.errors.PermissionDenied('resource denied');
                }
                return original.readFile(path, options);
            };
            const report = await Installation.check(new AbortController().signal, settings);
            expect(report.failures).toHaveLength(2);
            expect(report.failures[0]?.message).toContain('resource denied');
            expect(report.failures[1]?.message).toContain('templates denied');
            const controller = new AbortController();
            Deno.readFile = () => {
                controller.abort(new Error('during read'));
                throw controller.signal.reason;
            };
            await expect(Installation.check(controller.signal, settings)).rejects.toThrow(
                'during read',
            );
        } finally {
            Deno.lstat = original.lstat;
            Deno.readFile = original.readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'installation validates POSIX launcher target and normalized PATH membership',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const signal = new AbortController().signal;
        try {
            await Deno.mkdir(join(root, 'libexec'));
            await Deno.mkdir(join(root, 'bin'));
            const entryPath = join(root, 'libexec', 'cr-1');
            await Deno.writeTextFile(entryPath, 'binary', { mode: 0o755 });
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), {
                version: 1,
                files: [],
            });
            const launcher = join(root, 'bin', 'cr');
            await Deno.symlink('../libexec/cr-1', launcher);
            const settings = {
                entryPath,
                standalone: true,
                windows: false,
                path: `/other:${root}/bin:/last`,
            };
            expect(await Installation.check(signal, settings)).toEqual({
                failures: [],
                skipped: [],
            });
            expect(
                (await Installation.check(signal, { ...settings, path: `${root}/bin/` })).failures,
            ).toEqual([]);
            const padded = await Installation.check(signal, {
                ...settings,
                path: `/other: ${root}/bin/ :/last`,
            });
            expect(padded.failures).toHaveLength(1);
            expect(padded.failures[0]?.message).toContain('absent from PATH');
            await Deno.chmod(entryPath, 0o644);
            expect((await Installation.check(signal, settings)).failures[0]?.message).toContain(
                'Launcher:',
            );
            await Deno.remove(launcher);
            await Deno.symlink('../libexec', launcher);
            expect((await Installation.check(signal, settings)).failures).toHaveLength(1);
            await Deno.remove(launcher);
            await Deno.symlink('../libexec/directory', launcher);
            await Deno.mkdir(join(root, 'libexec', 'directory'));
            expect((await Installation.check(signal, settings)).failures[0]?.message).toContain(
                'not executable',
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test({
    name: 'installation launcher execute access respects owner permissions',
    ignore: Deno.build.os === 'windows' || Deno.uid() === 0,
    async fn() {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const entryPath = join(root, 'libexec', 'cr-1');
        try {
            await Deno.mkdir(join(root, 'libexec'));
            await Deno.mkdir(join(root, 'bin'));
            await Deno.writeTextFile(entryPath, 'must never execute');
            await Deno.chmod(entryPath, 0o601);
            await Deno.symlink('../libexec/cr-1', join(root, 'bin', 'cr'));
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), {
                version: 1,
                files: [],
            });
            const settings = {
                entryPath,
                standalone: true,
                windows: false,
                path: join(root, 'bin'),
            };
            const signal = new AbortController().signal;
            const report = await Installation.check(signal, settings);
            expect(report.failures).toHaveLength(1);
            expect(report.failures[0]?.message).toContain('Launcher:');
            expect(report.failures[0]?.repairable).toBe(false);
            expect(report.failures[0]?.manualRepair.length).toBeGreaterThan(0);
            await Deno.chmod(entryPath, 0o700);
            expect(await Installation.check(signal, settings)).toEqual({
                failures: [],
                skipped: [],
            });
        } finally {
            try {
                await Deno.chmod(entryPath, 0o700);
            } finally {
                await Deno.remove(root, { recursive: true });
            }
        }
    },
});

Deno.test('installation default resolution checks the running source entry', async () => {
    using _homes = isolateHarnessHomes();
    const original = Deno.env.get;
    try {
        for (const path of [undefined, '']) {
            Deno.env.get = () => path;
            const report = await Installation.check(new AbortController().signal);
            expect(report.failures).toEqual([]);
            expect(report.skipped).toHaveLength(3);
        }
    } finally {
        Deno.env.get = original;
    }
});

Deno.test('installation default compiled resolution uses the physical executable', async () => {
    using _homes = isolateHarnessHomes();
    const build = Deno.build;
    const execPath = Deno.execPath;
    const get = Deno.env.get;
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        await Deno.mkdir(join(root, 'libexec'));
        await Deno.writeTextFile(join(root, 'libexec', 'cr-1.exe'), 'binary');
        Object.defineProperty(Deno, 'build', {
            configurable: true,
            value: { ...build, standalone: true, os: 'windows' },
        });
        Deno.execPath = () => join(root, 'libexec', 'cr-1.exe');
        for (const path of ['', undefined]) {
            Deno.env.get = (name) => (name === 'PATH' ? path : join(root, 'uninstalled'));
            const report = await Installation.check(new AbortController().signal);
            expect(report.failures).toHaveLength(3);
            expect(report.skipped).toEqual(['Owned files: distribution manifest unavailable.']);
        }
        Deno.env.get = (name) => {
            if (name === 'PATH') {
                throw new Deno.errors.PermissionDenied('PATH denied');
            }
            return join(root, 'uninstalled');
        };
        const report = await Installation.check(new AbortController().signal);
        expect(report.failures).toHaveLength(3);
        expect(report.failures[2]?.message).toContain('PATH denied');
    } finally {
        Object.defineProperty(Deno, 'build', { configurable: true, value: build });
        Deno.execPath = execPath;
        Deno.env.get = get;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'installation accumulates missing and modified owned files and rejects foreign ownership',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const readTextFile = Deno.readTextFile;
        const controller = new AbortController();
        try {
            await Deno.mkdir(join(root, 'libexec'));
            const entryPath = join(root, 'libexec', 'cr-1');
            await Deno.writeTextFile(entryPath, 'binary');
            const settings = { entryPath, standalone: true, windows: false, path: '' };
            const manifestPath = join(root, DISTRIBUTION_MANIFEST);
            await InstallManifest.save(manifestPath, {
                version: 1,
                files: [
                    { path: 'libexec/cr-1', checksum: '0'.repeat(64), size: 0 },
                    { path: 'instructions/missing', checksum: '0'.repeat(64), size: 0 },
                ],
            });
            let report = await Installation.check(controller.signal, settings);
            expect(report.failures).toHaveLength(4);
            expect(report.failures[0]?.message).toContain('modified');
            expect(report.failures[1]?.message).toContain('missing');
            await InstallManifest.save(manifestPath, {
                version: 1,
                files: [{ path: 'personal', checksum: '0'.repeat(64), size: 0 }],
            });
            report = await Installation.check(controller.signal, settings);
            expect(report.failures[0]?.message).toContain('Invalid distribution ownership path');
            expect(report.skipped).toEqual(['Owned files: distribution manifest unavailable.']);
            Deno.readTextFile = (path, options) => {
                if (path === manifestPath) {
                    throw new Deno.errors.PermissionDenied('manifest denied');
                }
                return readTextFile(path, options);
            };
            report = await Installation.check(controller.signal, settings);
            expect(report.failures[0]?.message).toContain('manifest denied');
            expect(report.failures).toHaveLength(3);
        } finally {
            Deno.readTextFile = readTextFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'global harness instructions inspect both homes and every owned file without mutation',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.makeTempDir();
        const env = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR'] as const;
        const previous = env.map((name) => Deno.env.get(name));
        const signal = new AbortController().signal;
        const inspect = InstallManifest.inspect;
        try {
            for (const name of env) {
                Deno.env.set(name, join(root, name));
            }
            expect(await Installation.checkInstructions({ scope: 'global' }, signal)).toEqual({
                failures: [],
                skipped: [],
            });
            for (const name of env) {
                const home = join(root, name);
                await Deno.mkdir(home);
                for (const file of ['missing', 'modified', 'unreadable']) {
                    await Deno.writeTextFile(join(home, file), 'original');
                }
                await InstallManifest.save(
                    join(home, '.coderail-install'),
                    await InstallManifest.capture(home, ['missing', 'modified', 'unreadable']),
                );
            }
            expect(
                (await Installation.checkInstructions({ scope: 'global' }, signal)).failures,
            ).toEqual([]);
            for (const name of env) {
                await Deno.remove(join(root, name, 'missing'));
                await Deno.writeTextFile(join(root, name, 'modified'), 'changed');
            }
            InstallManifest.inspect = (home, manifest) => {
                if (manifest.files[0]?.path === 'unreadable') {
                    throw new Deno.errors.PermissionDenied('owned file denied');
                }
                return inspect(home, manifest);
            };
            const report = await Installation.checkInstructions({ scope: 'global' }, signal);
            expect(report.failures).toHaveLength(6);
            expect(
                report.failures.every(
                    (finding) => !finding.repairable && finding.manualRepair.length > 0,
                ),
            ).toBe(true);
            expect(report.failures.map((finding) => finding.message).join('\n')).toContain(
                'owned file denied',
            );
            InstallManifest.inspect = inspect;
            await Deno.writeTextFile(join(root, env[0], '.coderail-install'), '{');
            await Deno.remove(join(root, env[1], '.coderail-install'));
            await Deno.mkdir(join(root, env[1], '.coderail-install'));
            expect(
                (await Installation.checkInstructions({ scope: 'global' }, signal)).failures,
            ).toHaveLength(2);
            Deno.env.set(env[0], 'relative');
            expect(
                (await Installation.checkInstructions({ scope: 'global' }, signal)).failures,
            ).toHaveLength(2);
            const controller = new AbortController();
            controller.abort(new Error('cancelled'));
            await expect(
                Installation.checkInstructions({ scope: 'global' }, controller.signal),
            ).rejects.toThrow('cancelled');
        } finally {
            InstallManifest.inspect = inspect;
            env.forEach((name, index) => {
                const value = previous[index];
                if (value === undefined) {
                    Deno.env.delete(name);
                } else {
                    Deno.env.set(name, value);
                }
            });
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'instruction diagnostics handle unreadable manifests, unavailable connectors, races and cancellation',
    async () => {
        using _homes = isolateHarnessHomes();
        const { Harness } = await import('@harness');
        const root = await Deno.makeTempDir();
        const original = {
            get: Harness.get,
            load: InstallManifest.load,
            inspect: InstallManifest.inspect,
            lstat: Deno.lstat,
        };
        const signal = new AbortController().signal;
        const target = { scope: 'local' as const, projectRoot: root };
        try {
            await Deno.writeTextFile(join(root, '.coderail-install'), '{}');
            InstallManifest.load = () => {
                throw new Deno.errors.PermissionDenied('manifest denied');
            };
            expect(
                (await Installation.checkInstructions(target, signal)).failures[0]?.message,
            ).toContain('manifest denied');
            InstallManifest.load = () => Promise.resolve(null);
            expect((await Installation.checkInstructions(target, signal)).failures).toEqual([]);
            Harness.get = () => null;
            expect((await Installation.checkInstructions(target, signal)).failures).toHaveLength(2);
            Harness.get = original.get;
            Deno.lstat = () => Promise.reject(new Deno.errors.PermissionDenied('target denied'));
            expect((await Installation.checkInstructions(target, signal)).failures).toHaveLength(2);
            Deno.lstat = original.lstat;
            const controller = new AbortController();
            InstallManifest.load = () => {
                controller.abort(new Error('cancelled manifest'));
                throw new Deno.errors.PermissionDenied();
            };
            await expect(Installation.checkInstructions(target, controller.signal)).rejects.toThrow(
                'cancelled manifest',
            );
            const ownedController = new AbortController();
            InstallManifest.load = () =>
                Promise.resolve({
                    version: 1,
                    files: [{ path: 'owned', size: 0, checksum: '0'.repeat(64) }],
                });
            InstallManifest.inspect = () => {
                ownedController.abort(new Error('cancelled owned file'));
                throw new Deno.errors.PermissionDenied();
            };
            await expect(
                Installation.checkInstructions(target, ownedController.signal),
            ).rejects.toThrow('cancelled owned file');
        } finally {
            Harness.get = original.get;
            InstallManifest.load = original.load;
            InstallManifest.inspect = original.inspect;
            Deno.lstat = original.lstat;
            await Deno.remove(root, { recursive: true });
        }
    },
);

function isolateHarnessHomes(): Disposable {
    const root = Deno.makeTempDirSync();
    const names = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR'];
    const previous = names.map((name) => Deno.env.get(name));
    names.forEach((name) => Deno.env.set(name, join(root, name)));
    return {
        [Symbol.dispose](): void {
            names.forEach((name, index) => {
                const value = previous[index];
                if (value === undefined) {
                    Deno.env.delete(name);
                } else {
                    Deno.env.set(name, value);
                }
            });
            Deno.removeSync(root, { recursive: true });
        },
    };
}

Deno.test(
    'owned global and local Markdown allows customization without changing ownership baselines',
    async () => {
        using _homes = isolateHarnessHomes();
        const { Harness } = await import('@harness');
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        try {
            for (const target of [
                { scope: 'global' as const },
                { scope: 'local' as const, projectRoot: root },
            ]) {
                const manifests = new Map<string, Uint8Array>();
                for (const name of Harness.names) {
                    using connector = Harness.get(name, target);
                    if (!connector) {
                        throw new Error('missing connector');
                    }
                    const home = connector.home;
                    const prefix = name === 'codex' && target.scope === 'local' ? '.codex/' : '';
                    const paths = [
                        'skills/custom/SKILL.md',
                        'agents/worker.md',
                        'agents/codex.toml',
                        'skills/custom/reference.md',
                    ].map((path) => prefix + path);
                    for (const path of paths) {
                        await Deno.mkdir(join(home, path, '..'), { recursive: true });
                        await Deno.writeTextFile(join(home, path), 'baseline');
                    }
                    const manifest = join(home, '.coderail-install');
                    await InstallManifest.save(
                        manifest,
                        await InstallManifest.capture(home, paths),
                    );
                    manifests.set(manifest, await Deno.readFile(manifest));
                    await Deno.writeTextFile(
                        join(home, prefix + 'skills/custom/SKILL.md'),
                        '---\nname: custom\ndescription: My customized skill\n---\nCustom body',
                    );
                    await Deno.writeTextFile(
                        join(home, prefix + 'agents/worker.md'),
                        'description: My customized worker\n---\nWorker body',
                    );
                    await Deno.writeTextFile(
                        join(home, prefix + 'agents/unowned.md'),
                        'unowned invalid content',
                    );
                }
                const report = await Installation.checkInstructions(target, signal);
                expect(report.failures).toHaveLength(Harness.names.length);
                for (const failure of report.failures) {
                    await failure.repair?.apply(signal);
                }
                expect((await Installation.checkInstructions(target, signal)).failures).toEqual([]);
                for (const [path, bytes] of manifests) {
                    expect(await Deno.readFile(path)).toEqual(bytes);
                }
                using connector = Harness.get('codex', target);
                if (!connector) {
                    throw new Error('missing connector');
                }
                const prefix = target.scope === 'local' ? '.codex/' : '';
                await Deno.writeTextFile(
                    join(connector.home, prefix + 'agents/codex.toml'),
                    'changed',
                );
                await Deno.writeTextFile(
                    join(connector.home, prefix + 'skills/custom/reference.md'),
                    'changed',
                );
                const strict = await Installation.checkInstructions(target, signal);
                expect(strict.failures).toHaveLength(2);
                expect(strict.failures.every((finding) => !finding.repairable)).toBe(true);
                await Deno.remove(join(connector.home, prefix + 'skills/custom/SKILL.md'));
                expect(
                    (await Installation.checkInstructions(target, signal)).failures,
                ).toHaveLength(3);
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'source and compiled instruction assets validate content while other distribution entries retain strict integrity',
    async () => {
        using _homes = isolateHarnessHomes();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const signal = new AbortController().signal;
        try {
            for (const standalone of [false, true]) {
                const install = join(root, String(standalone));
                const resources = standalone ? install : join(install, 'assets');
                const entryPath = join(install, standalone ? 'libexec/cr-1' : 'src/main.ts');
                await Deno.mkdir(join(entryPath, '..'), { recursive: true });
                await Deno.writeTextFile(entryPath, 'binary', { mode: 0o755 });
                await Deno.mkdir(join(install, 'bin'));
                await Deno.symlink(entryPath, join(install, 'bin/cr'));
                const skill = join(resources, 'instructions/skills/custom/SKILL.md');
                const agent = join(resources, 'instructions/agents/worker.md');
                for (const path of [skill, agent]) {
                    await Deno.mkdir(join(path, '..'), { recursive: true });
                    await Deno.writeTextFile(path, 'baseline');
                }
                await Deno.mkdir(join(resources, 'templates'));
                await Deno.writeTextFile(join(resources, 'templates/sample'), 'template');
                const manifestPath = join(install, DISTRIBUTION_MANIFEST);
                if (standalone) {
                    await InstallManifest.save(
                        manifestPath,
                        await InstallManifest.capture(install, [
                            'libexec/cr-1',
                            'instructions/skills/custom/SKILL.md',
                            'instructions/agents/worker.md',
                            'templates/sample',
                        ]),
                    );
                }
                const baseline = standalone ? await Deno.readFile(manifestPath) : undefined;
                await Deno.writeTextFile(
                    skill,
                    '---\nname: custom\ndescription: Customized skill\n---\nCustom body',
                );
                await Deno.writeTextFile(
                    agent,
                    '---\nname: wrong\ndescription: Customized worker\n---\nWorker body',
                );
                const settings = {
                    standalone,
                    entryPath,
                    windows: false,
                    path: join(install, 'bin'),
                };
                const report = await Installation.check(signal, settings);
                expect(report.failures).toHaveLength(1);
                await report.failures[0]?.repair?.apply(signal);
                expect((await Installation.check(signal, settings)).failures).toEqual([]);
                if (standalone) {
                    expect(await Deno.readFile(manifestPath)).toEqual(baseline);
                    await Deno.writeTextFile(entryPath, 'changed binary');
                    await Deno.writeTextFile(
                        join(resources, 'templates/sample'),
                        'changed template',
                    );
                    expect((await Installation.check(signal, settings)).failures).toHaveLength(2);
                    await Deno.remove(agent);
                    expect((await Installation.check(signal, settings)).failures).toHaveLength(3);
                }
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
