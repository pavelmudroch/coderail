import { expect } from '@std/expect';
import { join } from '@std/path';
import { InstallManifest } from '../../../src/install-manifest.ts';
import {
    activateDistribution,
    withInstallationLock,
} from '../../../src/commands/upgrade/activation.ts';
import {
    cleanupStaleExecutables,
    deferredCleanupScript,
    retireExecutables,
} from '../../../src/commands/upgrade/cleanup.ts';
import { planAssets } from '../../../src/commands/upgrade/assets.ts';
import { targetTriple } from '../../../src/commands/upgrade/distribution.ts';

async function fixture(
    run: (root: string, selected: string, old: string) => Promise<void>,
): Promise<void> {
    const temp = await Deno.makeTempDir();
    const root = await Deno.realPath(temp);
    try {
        await Deno.mkdir(join(root, 'stage/instructions'), { recursive: true });
        await Deno.mkdir(join(root, 'stage/templates'));
        const executable = join(root, 'stage/cr');
        await Deno.writeTextFile(executable, 'binary');
        const stage = {
            root: join(root, 'stage'),
            executable,
            instructions: join(root, 'stage/instructions'),
            templates: join(root, 'stage/templates'),
            build: {
                schemaVersion: 1 as const,
                version: '1.0.0',
                commit: 'a'.repeat(40),
                target: targetTriple(Deno.build.os, Deno.build.arch),
            },
        };
        const first = await activateDistribution(root, stage);
        stage.build.version = '2.0.0';
        const second = await activateDistribution(root, stage);
        await run(root, second.selectedExecutable, first.selectedExecutable);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

Deno.test('stale cleanup protects running, current and selected binaries and ignores untracked or modified files', async () => {
    await fixture(async (root, selected, old) => {
        const untracked = join(root, 'libexec/cr-untracked');
        await Deno.writeTextFile(untracked, 'personal');
        expect(await cleanupStaleExecutables(root, { runningExecutable: old })).toEqual([]);
        expect(await cleanupStaleExecutables(root, { selectedExecutable: old })).toEqual([]);
        await withInstallationLock(root, async () => {
            await expect(cleanupStaleExecutables(root)).rejects.toThrow('busy');
        });
        await Deno.writeTextFile(old, 'modified');
        expect(await cleanupStaleExecutables(root)).toEqual([]);
        await Deno.writeTextFile(old, 'binary');
        expect(await cleanupStaleExecutables(root)).toEqual([old]);
        expect(await Deno.readTextFile(selected)).toBe('binary');
        expect(await Deno.readTextFile(untracked)).toBe('personal');
        const manifest = await InstallManifest.load(join(root, '.coderail-distribution.json'));
        expect(manifest?.files.some((file) => join(root, file.path) === old)).toBe(false);
    });
});

Deno.test('in-use failures remain owned for a later retry', async () => {
    await fixture(async (root, _selected, old) => {
        const reports: string[] = [];
        expect(
            await cleanupStaleExecutables(root, {
                remove: () => Promise.reject(new Deno.errors.PermissionDenied('in use')),
                report: (path) => {
                    reports.push(path);
                },
            }),
        ).toEqual([]);
        expect(reports).toEqual([old]);
        expect(await cleanupStaleExecutables(root)).toEqual([old]);
    });
});

Deno.test('retirement rechecks activation, preserves new launcher and reports helper startup failure', async () => {
    const build = Deno.build;
    Object.defineProperty(Deno, 'build', { value: { ...build, os: 'windows' } });
    try {
        await fixture(async (root, selected, old) => {
            const activation = {
                activated: true as const,
                selectedExecutable: selected,
                ownedExecutables: [],
                protectedExecutables: [],
                retiredExecutables: [],
            };
            let script = '';
            await retireExecutables(root, activation, { runningExecutable: old }, (value) => {
                script = value;
                return Promise.resolve();
            });
            expect(await Deno.readTextFile(old)).toBe('binary');
            expect(script.indexOf('Wait-Process')).toBeLessThan(script.indexOf('New-Item'));
            expect(script.indexOf('New-Item')).toBeLessThan(
                script.indexOf('Remove-Item -LiteralPath $path'),
            );
            expect(script).toContain('Get-FileHash');
            expect(script).toContain('$name -eq $current');
            const reports: string[] = [];
            await retireExecutables(root, activation, {
                runningExecutable: old,
                report: (path) => {
                    reports.push(path);
                },
            }, () => Promise.reject(new Error('startup failed')));
            expect(reports).toEqual([root]);
            expect(await Deno.readTextFile(join(root, 'bin/cr.cmd'))).toContain('cr-2.0.0.exe');
            await retireExecutables(root, { ...activation, selectedExecutable: old }, {}, () => {
                throw new Error('must not launch');
            });
            expect(await cleanupStaleExecutables(root)).toEqual([old]);
        });
    } finally {
        Object.defineProperty(Deno, 'build', { value: build });
    }
});

Deno.test('deferred script quotes installation paths and bounds deletion to requested ownership', () => {
    const script = deferredCleanupScript("C:\\user's install", 123, ['libexec/cr-old.exe']);
    expect(script).toContain("'C:\\user''s install'");
    expect(script).toContain('Wait-Process -Id 123');
    expect(script).toContain("@('libexec/cr-old.exe')");
    expect(script).toContain('ReparsePoint');
});

Deno.test('missing manifests, missing binaries and unsafe ownership inspection', async () => {
    const root = await Deno.makeTempDir();
    try {
        expect(await cleanupStaleExecutables(root)).toEqual([]);
        await Deno.mkdir(join(root, 'target'));
        await Deno.symlink(join(root, 'target'), join(root, '.coderail-distribution.json'));
        await expect(cleanupStaleExecutables(root)).rejects.toThrow('symlink');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
    await fixture(async (root, _selected, old) => {
        await Deno.remove(old);
        expect(await cleanupStaleExecutables(root)).toEqual([old]);
        const load = InstallManifest.load;
        InstallManifest.load = () => Promise.resolve(null);
        try {
            expect(await cleanupStaleExecutables(root)).toEqual([]);
        } finally {
            InstallManifest.load = load;
        }
    });
});

Deno.test('retirement deletes Unix running binaries only after activation and tolerates save errors', async () => {
    if (Deno.build.os === 'windows') return;
    await fixture(async (root, selected, old) => {
        const manifestPath = join(root, '.coderail-distribution.json');
        const manifest = await InstallManifest.load(manifestPath);
        if (!manifest) throw new Error('missing manifest');
        manifest.files.push({ path: 'instructions/a', checksum: 'a'.repeat(64), size: 0 });
        await InstallManifest.save(manifestPath, manifest);
        await retireExecutables(root, {
            activated: true,
            selectedExecutable: selected,
            ownedExecutables: [],
            protectedExecutables: [],
            retiredExecutables: [],
        }, { runningExecutable: old });
        await expect(Deno.stat(old)).rejects.toThrow();
    });
});

Deno.test('default Windows helper uses detached encoded command and no temporary resources', async () => {
    const build = Deno.build;
    const Command = Deno.Command;
    Object.defineProperty(Deno, 'build', { value: { ...build, os: 'windows' } });
    try {
        await fixture(async (root, selected, old) => {
            let detached = false;
            Deno.Command = class {
                constructor(command: string | URL, options: Deno.CommandOptions) {
                    expect(command).toBe('powershell.exe');
                    expect(options.args?.[2]).toBe('-EncodedCommand');
                    const encoded = options.args?.[3] ?? '';
                    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
                    expect(new TextDecoder('utf-16le').decode(bytes)).toContain('Wait-Process');
                }
                spawn(): unknown {
                    return {
                        unref: () => {
                            detached = true;
                        },
                    };
                }
            } as unknown as typeof Deno.Command;
            const activation = {
                activated: true as const,
                selectedExecutable: selected,
                ownedExecutables: [],
                protectedExecutables: [],
                retiredExecutables: [],
            };
            await retireExecutables(root, activation, { runningExecutable: old });
            expect(detached).toBe(true);
            await Deno.remove(old);
            await retireExecutables(root, activation);
            const load = InstallManifest.load;
            InstallManifest.load = () => Promise.resolve(null);
            try {
                await retireExecutables(root, activation);
            } finally {
                InstallManifest.load = load;
            }
        });
    } finally {
        Deno.Command = Command;
        Object.defineProperty(Deno, 'build', { value: build });
    }
});

Deno.test({
    name:
        'native Windows deferred cleanup waits for mapped executable exit and preserves active launcher',
    ignore: Deno.build.os !== 'windows',
    async fn(): Promise<void> {
        await fixture(async (root, selected, old) => {
            await Deno.copyFile(Deno.execPath(), old);
            const manifestPath = join(root, '.coderail-distribution.json');
            const manifest = await InstallManifest.load(manifestPath);
            if (!manifest) throw new Error('missing manifest');
            const relative = `libexec/${old.split(/[\\/]/).at(-1)}`;
            const captured = await InstallManifest.capture(root, [relative]);
            manifest.files = manifest.files.filter((file) => file.path !== relative);
            manifest.files.push(...captured.files);
            await InstallManifest.save(manifestPath, manifest);
            const child = new Deno.Command(old, {
                args: ['eval', 'console.log("ready"); setInterval(() => {}, 1000)'],
                stdout: 'piped',
            }).spawn();
            const reader = child.stdout.getReader();
            let exited = false;
            try {
                await reader.read();
                reader.releaseLock();
                await expect(Deno.remove(old)).rejects.toThrow();
                const script = deferredCleanupScript(root, child.pid, [relative]);
                const helper = new Deno.Command('powershell.exe', {
                    args: ['-NoProfile', '-NonInteractive', '-Command', script],
                    stdout: 'null',
                    stderr: 'piped',
                }).spawn();
                expect(await Deno.readTextFile(join(root, 'bin/cr.cmd'))).toContain(
                    selected.split(/[\\/]/).at(-1),
                );
                expect((await Deno.stat(old)).isFile).toBe(true);
                child.kill();
                await child.status;
                exited = true;
                const output = await helper.output();
                expect(output.success).toBe(true);
                await expect(Deno.stat(old)).rejects.toThrow();
                expect(await Deno.readTextFile(selected)).toBe('binary');
                expect(await cleanupStaleExecutables(root)).toEqual([old]);
            } finally {
                if (!exited) {
                    child.kill();
                    await child.status;
                }
                await child.stdout.cancel();
            }
        });
    },
});

Deno.test('residual failures are reported by default and ownership survives save failure for retry', async () => {
    await fixture(async (root, selected, old) => {
        const error = console.error;
        const reports: unknown[][] = [];
        console.error = (...args: unknown[]) => {
            reports.push(args);
        };
        const save = InstallManifest.save;
        try {
            await cleanupStaleExecutables(root, {
                remove: () => Promise.reject(new Error('in use')),
            });
            InstallManifest.save = () => Promise.reject(new Error('save failed'));
            await retireExecutables(root, {
                activated: true,
                selectedExecutable: selected,
                ownedExecutables: [],
                protectedExecutables: [],
                retiredExecutables: [],
            });
            expect(reports.length).toBe(2);
        } finally {
            console.error = error;
            InstallManifest.save = save;
        }
        expect(await cleanupStaleExecutables(root)).toEqual([old]);
    });
});

Deno.test('asset validation and declined confirmation never trigger executable cleanup', async () => {
    await fixture(async (root, _selected, old) => {
        await Deno.mkdir(join(root, 'instructions'), { recursive: true });
        await Deno.writeTextFile(join(root, 'instructions/a'), 'personal');
        await Deno.writeTextFile(join(root, 'stage/instructions/a'), 'new');
        const stage = {
            root: join(root, 'stage'),
            executable: join(root, 'stage/cr'),
            instructions: join(root, 'stage/instructions'),
            templates: join(root, 'stage/templates'),
            build: {
                schemaVersion: 1 as const,
                version: '3.0.0',
                commit: 'a'.repeat(40),
                target: targetTriple(Deno.build.os, Deno.build.arch),
            },
        };
        await expect(planAssets(root, stage)).rejects.toThrow('force');
        const plan = await planAssets(root, stage, {
            force: true,
            interactive: true,
            confirm: async () => {
                expect(await Deno.readTextFile(old)).toBe('binary');
                return false;
            },
        });
        expect(plan.actions[0]?.approved).toBe(false);
        expect(await Deno.readTextFile(old)).toBe('binary');
    });
});
