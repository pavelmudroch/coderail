import { InstallManifest } from '@install-manifest';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { Installation } from '../../../src/commands/doctor/installation.ts';
import { windowsLauncher } from '../../../src/commands/upgrade/activation.ts';
import { DISTRIBUTION_MANIFEST } from '../../../src/commands/upgrade/assets.ts';

Deno.test({
    name: 'installation rejects a FIFO manifest and continues independent checks without opening it',
    ignore: Deno.build.os === 'windows',
    async fn() {
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
                path: `/other: ${root}/bin/ :/last`,
            };
            expect(await Installation.check(signal, settings)).toEqual({
                failures: [],
                skipped: [],
            });
            await Deno.chmod(entryPath, 0o644);
            expect((await Installation.check(signal, settings)).failures[0]?.message).toContain(
                'not executable',
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

Deno.test('installation default resolution checks the running source entry', async () => {
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
            Deno.env.get = () => path;
            const report = await Installation.check(new AbortController().signal);
            expect(report.failures).toHaveLength(3);
            expect(report.skipped).toEqual(['Owned files: distribution manifest unavailable.']);
        }
        Deno.env.get = () => {
            throw new Deno.errors.PermissionDenied('PATH denied');
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
