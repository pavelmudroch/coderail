import { expect } from '@std/expect';
import { InstallManifest } from '../../../src/install-manifest.ts';
import { join } from '@std/path';
import {
    activateDistribution,
    windowsLauncher,
    withInstallationLock,
} from '../../../src/commands/upgrade/activation.ts';
import {
    type StagedDistribution,
    targetTriple,
} from '../../../src/commands/upgrade/distribution.ts';

async function fixture(
    run: (root: string, stage: StagedDistribution) => Promise<void>,
): Promise<void> {
    const temp = await Deno.makeTempDir();
    const root = join(await Deno.realPath(temp), 'custom root');
    const staging = join(temp, 'stage');
    try {
        await Deno.mkdir(root);
        await Deno.mkdir(join(staging, 'instructions'), { recursive: true });
        await Deno.mkdir(join(staging, 'templates'));
        await Deno.writeTextFile(join(staging, 'instructions/a'), 'asset');
        await Deno.writeTextFile(join(staging, 'templates/a'), 'asset');
        const executable = join(staging, 'cr');
        await Deno.writeTextFile(executable, 'binary');
        await run(root, {
            root: staging,
            executable,
            instructions: join(staging, 'instructions'),
            templates: join(staging, 'templates'),
            build: {
                schemaVersion: 1,
                version: '1.0.0',
                commit: 'a'.repeat(40),
                target: targetTriple(Deno.build.os, Deno.build.arch),
            },
        });
    } finally {
        await Deno.remove(temp, { recursive: true });
    }
}

Deno.test('bootstrap, reuse, upgrades and downgrades preserve physical binaries and protect cleanup identities', async () => {
    await fixture(async (root, stage) => {
        await Deno.mkdir(join(root, 'libexec'));
        const running = join(
            root,
            'libexec/cr-1.0.0' + (Deno.build.os === 'windows' ? '.exe' : ''),
        );
        await Deno.copyFile(stage.executable, running);
        const first = await activateDistribution(root, stage, { runningExecutable: running });
        expect(first.selectedExecutable).toBe(running);
        const again = await activateDistribution(root, stage, { runningExecutable: running });
        expect(again.selectedExecutable).toBe(running);
        stage.build.version = '2.0.0';
        const next = await activateDistribution(root, stage, { runningExecutable: running });
        expect(next.selectedExecutable).not.toBe(running);
        expect(next.protectedExecutables).toContain(running);
        expect(next.protectedExecutables).toContain(next.selectedExecutable);
        expect(next.currentLauncherTarget).toBe(running);
        expect(next.retiredExecutables).toEqual([]);
        const back = await activateDistribution(root, {
            ...stage,
            build: { ...stage.build, version: '1.0.0' },
        }, { runningExecutable: next.selectedExecutable });
        expect(back.selectedExecutable).toBe(running);
        expect(await Deno.readTextFile(running)).toBe('binary');
        if (Deno.build.os !== 'windows') {
            expect(await Deno.realPath(join(root, 'bin/cr'))).toBe(running);
        }
        expect((await Array.fromAsync(Deno.readDir(join(root, 'bin')))).map((entry) => entry.name))
            .toEqual([Deno.build.os === 'windows' ? 'cr.cmd' : 'cr']);
    });
});

Deno.test('same version changed bytes and untracked collisions select new destinations; canaries include commit', async () => {
    await fixture(async (root, stage) => {
        await Deno.mkdir(join(root, 'libexec'));
        const collision = join(
            root,
            'libexec/cr-1.0.0' + (Deno.build.os === 'windows' ? '.exe' : ''),
        );
        await Deno.writeTextFile(collision, 'personal');
        const first = await activateDistribution(root, stage);
        expect(first.selectedExecutable).not.toBe(collision);
        await Deno.writeTextFile(stage.executable, 'changed binary');
        const second = await activateDistribution(root, stage);
        expect(second.selectedExecutable).not.toBe(first.selectedExecutable);
        expect(await Deno.readTextFile(first.selectedExecutable)).toBe('binary');
        expect(await Deno.readTextFile(collision)).toBe('personal');
        stage.build.version = 'canary';
        const canary = await activateDistribution(root, stage);
        expect(canary.selectedExecutable).toContain('canary-' + 'a'.repeat(40));
        stage.build.commit = 'b'.repeat(40);
        expect((await activateDistribution(root, stage)).selectedExecutable).not.toBe(
            canary.selectedExecutable,
        );
    });
});

Deno.test('coordination rejects contention before inspecting or changing installed state and releases on failure', async () => {
    await fixture(async (root, stage) => {
        await withInstallationLock(root, async () => {
            const activation = activateDistribution(root, stage);
            await expect(activation).rejects.toThrow('busy');
            await expect(activation).rejects.toMatchObject({
                cause: expect.any(Deno.errors.AlreadyExists),
            });
            await expect(Deno.stat(join(root, 'libexec'))).rejects.toThrow();
        });
        await expect(withInstallationLock(root, () => Promise.reject(new Error('failure')))).rejects
            .toThrow('failure');
        await activateDistribution(root, stage);
    });
});

Deno.test('assets, manifest and launcher preparation failures preserve active launcher', async () => {
    await fixture(async (root, stage) => {
        const first = await activateDistribution(root, stage);
        stage.build.version = '2.0.0';
        await Deno.writeTextFile(join(root, 'templates/a'), 'edited');
        await expect(activateDistribution(root, stage)).rejects.toThrow('force');
        await expect(activateDistribution(root, stage, { force: true, yes: true }, {
            write: Deno.copyFile,
            remove: Deno.remove,
            save: () => Promise.reject(new Error('save failure')),
        })).rejects.toThrow('application failed');
        const rename = Deno.rename;
        Deno.rename = (from, to) =>
            String(to).includes('bin')
                ? Promise.reject(new Error('activation failed'))
                : rename(from, to);
        try {
            await expect(activateDistribution(root, stage, { force: true, yes: true })).rejects
                .toThrow('activation failed');
        } finally {
            Deno.rename = rename;
        }
        if (Deno.build.os !== 'windows') {
            expect(await Deno.realPath(join(root, 'bin/cr'))).toBe(first.selectedExecutable);
        }
    });
});

Deno.test('all six target mappings and Windows launcher forwarding contract', () => {
    for (const os of ['linux', 'darwin', 'windows']) {
        for (const arch of ['aarch64', 'x86_64']) expect(targetTriple(os, arch)).toContain(arch);
    }
    expect(windowsLauncher('cr-1.0.0.exe')).toBe(
        '@echo off\r\n"%~dp0..\\libexec\\cr-1.0.0.exe" %*\r\nexit /b %errorlevel%\r\n',
    );
});

// Native Windows cmd quoting/exit propagation requires a Windows host; Unix tests inspect real links.
Deno.test({
    name: 'native Windows launcher forwards spaces, quotes and exit status',
    ignore: Deno.build.os !== 'windows',
    async fn(): Promise<void> {
        await fixture(async (root, stage) => {
            // Use the native Deno executable as a small argument/exit-code probe.
            await Deno.copyFile(Deno.execPath(), stage.executable);
            await activateDistribution(root, stage);
            const probe = join(root, 'probe.ts');
            await Deno.writeTextFile(
                probe,
                'console.log(JSON.stringify(Deno.args)); Deno.exit(23);',
            );
            const output = await new Deno.Command('cmd.exe', {
                args: [
                    '/d',
                    '/s',
                    '/c',
                    `""${join(root, 'bin/cr.cmd')}" run "${probe}" "two words" "a\\"b""`,
                ],
                stdout: 'piped',
            }).output();
            expect(output.code).toBe(23);
            expect(JSON.parse(new TextDecoder().decode(output.stdout))).toEqual([
                'two words',
                'a"b',
            ]);
        });
    },
});

Deno.test('direct invocation protects running binary when launcher points elsewhere', async () => {
    await fixture(async (root, stage) => {
        const first = await activateDistribution(root, stage);
        stage.build.version = '2.0.0';
        const second = await activateDistribution(root, stage);
        stage.build.version = '3.0.0';
        const third = await activateDistribution(root, stage, {
            runningExecutable: first.selectedExecutable,
        });
        expect(third.currentLauncherTarget).toBe(second.selectedExecutable);
        expect(third.runningExecutable).toBe(first.selectedExecutable);
        expect(third.protectedExecutables).toEqual([
            first.selectedExecutable,
            second.selectedExecutable,
            third.selectedExecutable,
        ]);
        stage.build.version = '4.0.0';
        const fourth = await activateDistribution(root, stage);
        expect(fourth.retiredExecutables).toContain(first.selectedExecutable);
        expect(fourth.retiredExecutables).toContain(second.selectedExecutable);
        expect(fourth.protectedExecutables).toContain(await Deno.realPath(Deno.execPath()));
    });
});

Deno.test('asset write failure and launcher preparation failure do not switch launcher', async () => {
    await fixture(async (root, stage) => {
        const first = await activateDistribution(root, stage);
        stage.build.version = '2.0.0';
        await expect(activateDistribution(root, stage, {}, {
            write: () => Promise.reject(new Error('write failed')),
            remove: Deno.remove,
            save: InstallManifest.save,
        })).rejects.toThrow('application failed');
        if (Deno.build.os !== 'windows') {
            const symlink = Deno.symlink;
            Deno.symlink = () => Promise.reject(new Error('prepare failed'));
            try {
                await expect(activateDistribution(root, stage)).rejects.toThrow('prepare failed');
            } finally {
                Deno.symlink = symlink;
            }
            expect(await Deno.realPath(join(root, 'bin/cr'))).toBe(first.selectedExecutable);
        }
    });
});

Deno.test('invalid build identity, unsupported host and unsafe launcher fail before staging', async () => {
    await fixture(async (root, stage) => {
        await expect(
            activateDistribution(root, { ...stage, build: { ...stage.build, target: 'unknown' } }),
        ).rejects.toThrow('target');
        for (
            const build of [{ ...stage.build, version: '../bad' }, {
                ...stage.build,
                commit: 'bad',
            }]
        ) {
            await expect(activateDistribution(root, { ...stage, build })).rejects.toThrow(
                'identity',
            );
        }
        await Deno.mkdir(join(root, 'bin'));
        await Deno.writeTextFile(
            join(root, 'bin', Deno.build.os === 'windows' ? 'cr.cmd' : 'cr'),
            'personal',
        );
        await expect(activateDistribution(root, stage)).rejects.toThrow('Unsafe existing launcher');
        await expect(Deno.stat(join(root, 'libexec'))).rejects.toThrow();
        expect(() => windowsLauncher('../bad.exe')).toThrow('Unsafe');
    });
});

Deno.test('Windows launcher preparation and replacement can be exercised without symlink privileges', async () => {
    const build = Deno.build;
    Object.defineProperty(Deno, 'build', { value: { ...build, os: 'windows' } });
    try {
        await fixture(async (root, stage) => {
            const first = await activateDistribution(root, stage);
            expect(await Deno.readTextFile(join(root, 'bin/cr.cmd'))).toBe(
                windowsLauncher('cr-1.0.0.exe'),
            );
            expect((await activateDistribution(root, stage)).currentLauncherTarget).toBe(
                first.selectedExecutable,
            );
            await Deno.writeTextFile(join(root, 'bin/cr.cmd'), 'personal');
            await expect(activateDistribution(root, stage)).rejects.toThrow(
                'Unsafe existing launcher',
            );
        });
    } finally {
        Object.defineProperty(Deno, 'build', { value: build });
    }
});

Deno.test('unsafe private directories and inspection errors are rejected', async () => {
    await fixture(async (root, stage) => {
        await Deno.writeTextFile(join(root, 'libexec'), 'personal');
        await expect(activateDistribution(root, stage)).rejects.toThrow(
            'Unsafe executable directory',
        );
    });
    for (const suffix of ['.coderail-upgrade.lock', 'bin', 'bin/cr', 'libexec']) {
        await fixture(async (root, stage) => {
            const mkdir = Deno.mkdir;
            const lstat = Deno.lstat;
            Deno.mkdir = (path, options) =>
                String(path) === join(root, suffix) && suffix !== 'bin/cr'
                    ? Promise.reject(new Deno.errors.PermissionDenied('denied'))
                    : mkdir(path, options);
            Deno.lstat = (path) =>
                String(path) === join(root, suffix) && suffix === 'bin/cr'
                    ? Promise.reject(new Deno.errors.PermissionDenied('denied'))
                    : lstat(path);
            try {
                await expect(activateDistribution(root, stage)).rejects.toThrow('denied');
            } finally {
                Deno.mkdir = mkdir;
                Deno.lstat = lstat;
            }
        });
    }
});

Deno.test('stale ownership, lookalike names and altered owned binaries are never reused', async () => {
    await fixture(async (root, stage) => {
        const first = await activateDistribution(root, stage);
        const lookalike = join(root, 'libexec/cr-1.0.0-untracked');
        await Deno.writeTextFile(lookalike, 'binary');
        const manifestPath = join(root, '.coderail-distribution.json');
        const manifest = await InstallManifest.load(manifestPath);
        if (!manifest) throw new Error('missing manifest');
        const extra = await InstallManifest.capture(root, ['libexec/cr-1.0.0-untracked']);
        manifest.files.push(...extra.files);
        await InstallManifest.save(manifestPath, manifest);
        await Deno.remove(first.selectedExecutable);
        const next = await activateDistribution(root, stage);
        expect(next.selectedExecutable).not.toBe(lookalike);
        await Deno.writeTextFile(next.selectedExecutable, 'changed');
        expect((await activateDistribution(root, stage)).selectedExecutable).not.toBe(
            next.selectedExecutable,
        );
    });
});

Deno.test('executable copy, creation, integrity and cleanup failures are surfaced', async () => {
    for (const failure of ['source', 'closed', 'destination', 'integrity', 'cleanup', 'owned']) {
        await fixture(async (root, stage) => {
            if (failure === 'owned') await activateDistribution(root, stage);
            const open = Deno.open;
            const readFile = Deno.readFile;
            const remove = Deno.remove;
            Deno.open = async (path, options) => {
                if (
                    ((failure === 'source' || failure === 'closed') &&
                        String(path) === stage.executable) ||
                    (failure === 'destination' && String(path).includes('libexec'))
                ) {
                    return Promise.reject(new Deno.errors.PermissionDenied('copy denied'));
                }
                const file = await open(path, options);
                if (failure === 'closed' && String(path).includes('libexec')) {
                    const close = file.close.bind(file);
                    file.close = () => {
                        close();
                        throw new Error('already closed');
                    };
                }
                return file;
            };
            Deno.readFile = (path) => {
                if (String(path).includes('libexec') && failure === 'integrity') {
                    return Promise.resolve(new Uint8Array([0]));
                }
                if (String(path).includes('libexec') && failure === 'owned') {
                    return Promise.reject(new Deno.errors.PermissionDenied('owned denied'));
                }
                return readFile(path);
            };
            Deno.remove = (path, options) =>
                String(path).includes('bin/.cr-') && failure === 'cleanup'
                    ? Promise.reject(new Deno.errors.PermissionDenied('cleanup denied'))
                    : remove(path, options);
            try {
                await expect(activateDistribution(root, stage)).rejects.toThrow(
                    failure === 'integrity'
                        ? 'Staged executable changed'
                        : failure === 'cleanup'
                        ? 'cleanup denied'
                        : failure === 'owned'
                        ? 'owned denied'
                        : 'copy denied',
                );
            } finally {
                Deno.open = open;
                Deno.readFile = readFile;
                Deno.remove = remove;
            }
        });
    }
});

Deno.test('directory inspection failure is preflight and never creates executable directories', async () => {
    await fixture(async (root, stage) => {
        const lstat = Deno.lstat;
        Deno.lstat = (path) =>
            String(path) === join(root, 'bin')
                ? Promise.reject(new Deno.errors.PermissionDenied('inspection denied'))
                : lstat(path);
        try {
            await expect(activateDistribution(root, stage)).rejects.toThrow('inspection denied');
        } finally {
            Deno.lstat = lstat;
        }
        await expect(Deno.stat(join(root, 'bin'))).rejects.toThrow();
        await expect(Deno.stat(join(root, 'libexec'))).rejects.toThrow();
    });
});

Deno.test('directory disappearing during creation is reported', async () => {
    await fixture(async (root, stage) => {
        const lstat = Deno.lstat;
        let inspections = 0;
        Deno.lstat = (path) => {
            if (String(path) === join(root, 'bin') && ++inspections === 2) {
                return Promise.reject(new Deno.errors.NotFound('directory disappeared'));
            }
            return lstat(path);
        };
        try {
            await expect(activateDistribution(root, stage)).rejects.toThrow(
                'directory disappeared',
            );
        } finally {
            Deno.lstat = lstat;
        }
    });
});

Deno.test('mutation hook runs after planning and before creating executable directories', async () => {
    await fixture(async (root, stage) => {
        let called = false;
        await activateDistribution(root, stage, {
            beforeMutation: async (lockedRoot, plan) => {
                expect(lockedRoot).toBe(root);
                expect(plan.actions.length).toBe(2);
                await expect(Deno.stat(join(root, 'bin'))).rejects.toThrow();
                called = true;
            },
        });
        expect(called).toBe(true);
    });
});
