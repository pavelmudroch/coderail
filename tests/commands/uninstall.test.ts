import { Harness } from '@harness';
import { InstallManifest } from '@install-manifest';
import { Log } from '@log';
import { Path } from '@path';
import { expect } from '@std/expect';
import { dirname, join } from '@std/path';

import { UsageError } from '../../src/cli/usage-error.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { Uninstall } from '../../src/commands/uninstall.ts';

Deno.test('Uninstall parses optional harnesses and flags', () => {
    const command = new Uninstall();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([])).toEqual({
        args: { help: false, force: false, yes: false, no: false, local: false, harnesses: [] },
        rest: [],
    });
    expect(command.parseArguments(new Array<string>(1))).toEqual(command.parseArguments([]));
    for (const flags of [
        ['-f', '-y'],
        ['--force', '--yes'],
    ]) {
        expect(command.parseArguments(['codex', ...flags, 'claude'])).toEqual({
            args: {
                help: false,
                force: true,
                yes: true,
                no: false,
                local: false,
                harnesses: ['codex', 'claude'],
            },
            rest: [],
        });
    }
    expect(command.parseArguments(['codex', '--', '--help', '-f', '-y'])).toEqual({
        args: {
            help: false,
            force: false,
            yes: false,
            no: false,
            local: false,
            harnesses: ['codex', '--help', '-f', '-y'],
        },
        rest: [],
    });
});

Deno.test('Uninstall handles help and rejects invalid options', () => {
    const command = new Uninstall();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    for (const option of [
        '--unknown',
        '-x',
        '--help=value',
        '--force=false',
        '--yes=true',
        '--self=true',
        '--self',
    ]) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
    expect(command.getUsage()).toContain(
        'cr uninstall [--help] [--local] [--force [--yes | --no]] [<harness> ...]',
    );
    for (const harness of Harness.names) {
        expect(command.getUsage()).toContain(`- ${harness}`);
    }
});

Deno.test('Uninstall validates confirmation policy', () => {
    const command = new Uninstall();
    for (const flag of ['--no', '-n']) {
        expect(command.parseArguments(['--force', flag]).args.no).toBe(true);
    }
    for (const args of [
        ['--yes'],
        ['-y'],
        ['--no'],
        ['-n'],
        ['--force', '--yes', '--no'],
        ['--no=true'],
    ]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['--yes', '--no', '--help']))).toBe(
        true,
    );
});

type UninstallContext = RunContext<ReturnType<Uninstall['parseArguments']>['args']>;

type UninstallFixture = AsyncDisposable & {
    root: string;
    manifestPath: string;
    events: string[];
    messages: unknown[][];
    context: UninstallContext;
    controller: AbortController;
    run(args?: string[]): Promise<void>;
};

async function setupUninstall(
    files: Record<string, string> = { a: 'A', b: 'B', c: 'C' },
    local = false,
): Promise<UninstallFixture> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const manifestPath = join(root, Path.INSTALL_MANIFEST_NAME);
    for (const [path, content] of Object.entries(files)) {
        await Deno.mkdir(dirname(join(root, path)), { recursive: true });
        await Deno.writeTextFile(join(root, path), content);
    }
    await InstallManifest.save(
        manifestPath,
        await InstallManifest.capture(root, Object.keys(files)),
    );
    const original = {
        get: Harness.get,
        output: Log.output,
        notice: Log.notice,
        error: Log.error,
        remove: Deno.remove,
        save: InstallManifest.save,
        load: InstallManifest.load,
        inspect: InstallManifest.inspect,
        confirm: Log.confirm,
        isTerminal: Deno.stdin.isTerminal,
    };
    const events: string[] = [];
    const messages: unknown[][] = [];
    Harness.get = (name, _target) => {
        events.push(`get:${name}`);
        return {
            name,
            home: root,
            run: () => Promise.reject(new Error('Installation must not run sessions.')),
            translatePrompt: (prompt) => prompt,
            translateSkill: () => Promise.resolve([]),
            translateGlobalInstructions: () => Promise.resolve([]),
            translateSubagent: () => Promise.resolve([]),
            [Symbol.dispose](): void {
                events.push(`dispose:${name}`);
            },
        };
    };
    Log.output =
        Log.notice =
        Log.error =
            (...values): void => {
                messages.push(values);
            };
    const command = new Uninstall();
    const controller = new AbortController();
    const context: UninstallContext = {
        context: { currentWorkingDirectory: root, installRoot: '/install' },
        configuration: {
            defaultHarness: 'codex',
            logLevel: 'normal',
            noColor: false,
            nonInteractive: true,
            verify: { rules: [] },
        },
        parsedArguments: command.parseArguments([]),
        signal: controller.signal,
    };
    if (local) {
        await Deno.mkdir(join(root, '.coderail'), { recursive: true });
        context.context.repositoryRoot = root;
    }
    return {
        root,
        manifestPath,
        events,
        messages,
        context,
        controller,
        async run(args: string[] = []): Promise<void> {
            context.parsedArguments = command.parseArguments(local ? ['--local', ...args] : args);
            await command.run(context);
        },
        async [Symbol.asyncDispose](): Promise<void> {
            Harness.get = original.get;
            Log.output = original.output;
            Log.notice = original.notice;
            Log.error = original.error;
            Deno.remove = original.remove;
            InstallManifest.save = original.save;
            InstallManifest.load = original.load;
            InstallManifest.inspect = original.inspect;
            Log.confirm = original.confirm;
            Deno.stdin.isTerminal = original.isTerminal;
            await Deno.remove(root, { recursive: true });
        },
    };
}

Deno.test(
    'Uninstall removes tracked files and manifest, tolerates missing files, and keeps unrelated files',
    async () => {
        await using fixture = await setupUninstall({
            'skills/code/SKILL.md': 'code',
            missing: 'gone',
        });
        await Deno.remove(join(fixture.root, 'missing'));
        await Deno.writeTextFile(join(fixture.root, 'unrelated'), 'keep');
        await fixture.run();
        await expect(Deno.stat(join(fixture.root, 'skills/code/SKILL.md'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
        expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
        expect(await Deno.readTextFile(join(fixture.root, 'unrelated'))).toBe('keep');
        expect(fixture.events).toEqual(['get:codex', 'dispose:codex']);
        expect(fixture.messages).toContainEqual([
            'Uninstalled instructions for codex: 1 removed, 1 missing, 0 skipped.',
        ]);
    },
);

Deno.test('Uninstall handles absent and empty manifests and absent homes', async () => {
    await using fixture = await setupUninstall({});
    await fixture.run();
    expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
    await fixture.run();
    await Deno.remove(fixture.root, { recursive: true });
    await fixture.run();
    await Deno.mkdir(fixture.root);
    expect(fixture.messages).toContainEqual(['Nothing to uninstall for codex.']);
});

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Uninstall requires force before removing modified files and makes no partial changes during planning`,
        async () => {
            await using fixture = await setupUninstall(undefined, local);
            await Deno.writeTextFile(join(fixture.root, 'b'), 'modified');
            await expect(fixture.run()).rejects.toThrow('Modified file "b" requires --force.');
            expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('A');
            expect((await InstallManifest.load(fixture.manifestPath))?.files).toHaveLength(3);
            const failure = fixture.messages.find((values) => values[0] instanceof Error)?.[0];
            expect(failure).toBeInstanceOf(Error);
            expect((failure as Error).cause).toBeInstanceOf(Error);
            expect(((failure as Error).cause as Error).message).toContain('Removed: none.');
        },
    );
}

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Uninstall keeps declined modified files tracked and accepts --yes without a terminal`,
        async () => {
            await using fixture = await setupUninstall(undefined, local);
            await Deno.writeTextFile(join(fixture.root, 'b'), 'modified');
            await fixture.run(['--force', '--no']);
            expect(await Deno.readTextFile(join(fixture.root, 'b'))).toBe('modified');
            expect(
                (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
            ).toEqual(['b']);
            await fixture.run(['--force', '--yes']);
            expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
        },
    );
}

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Uninstall prompts for each modified file and respects the answer`,
        async () => {
            await using fixture = await setupUninstall({ a: 'A', b: 'B' }, local);
            await Deno.writeTextFile(join(fixture.root, 'a'), 'modified');
            await Deno.writeTextFile(join(fixture.root, 'b'), 'modified');
            fixture.context.configuration.nonInteractive = false;
            Deno.stdin.isTerminal = () => true;
            const prompts: string[] = [];
            Log.confirm = (message): boolean => {
                prompts.push(String(message));
                return prompts.length === 1;
            };
            await fixture.run(['--force']);
            expect(prompts).toEqual([
                `Remove modified file "${join(fixture.root, 'a')}"?`,
                `Remove modified file "${join(fixture.root, 'b')}"?`,
            ]);
            expect(
                (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
            ).toEqual(['b']);
        },
    );
}

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Uninstall refuses confirmation without an interactive terminal`,
        async () => {
            await using fixture = await setupUninstall({ a: 'A' }, local);
            await Deno.writeTextFile(join(fixture.root, 'a'), 'modified');
            for (const nonInteractive of [true, false]) {
                fixture.context.configuration.nonInteractive = nonInteractive;
                Deno.stdin.isTerminal = () => false;
                await expect(fixture.run(['--force'])).rejects.toThrow(
                    'Confirmation requires an interactive terminal',
                );
                expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('modified');
            }
        },
    );
}

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Uninstall reports completed and pending absolute paths on removal failure and saves the remaining manifest`,
        async () => {
            await using fixture = await setupUninstall(undefined, local);
            const remove = Deno.remove;
            Deno.remove = (path, options): Promise<void> => {
                if (path === join(fixture.root, 'b')) {
                    return Promise.reject(new Error('permission denied'));
                }
                return remove(path, options);
            };
            let failure: unknown;
            try {
                await fixture.run();
            } catch (error) {
                failure = error;
            }
            expect(failure).toBeInstanceOf(AggregateError);
            const message = (failure as Error).message;
            expect(message).toContain('permission denied');
            expect(message).toContain(`Removed: "${join(fixture.root, 'a')}".`);
            expect(message).toContain(
                `Remaining files: "${join(fixture.root, 'b')}", "${join(fixture.root, 'c')}".`,
            );
            expect(message).toContain('updated to track remaining files');
            expect(
                (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
            ).toEqual(['b', 'c']);
            expect(await Deno.readTextFile(join(fixture.root, 'b'))).toBe('B');
        },
    );
}

Deno.test(
    'Uninstall reports persistence failure alongside the original removal failure',
    async () => {
        await using fixture = await setupUninstall();
        const remove = Deno.remove;
        Deno.remove = (path, options): Promise<void> => {
            if (path === join(fixture.root, 'b')) {
                return Promise.reject(new Error('removal failed'));
            }
            return remove(path, options);
        };
        InstallManifest.save = (): Promise<void> => Promise.reject(new Error('disk full'));
        await expect(fixture.run()).rejects.toThrow('Manifest persistence failed: disk full.');
        expect((await InstallManifest.load(fixture.manifestPath))?.files).toHaveLength(3);
    },
);

Deno.test(
    'Uninstall reports manifest deletion failure after all tracked files were removed',
    async () => {
        await using fixture = await setupUninstall({ a: 'A' });
        const remove = Deno.remove;
        Deno.remove = (path, options): Promise<void> => {
            if (path === fixture.manifestPath) {
                return Promise.reject(new Error('manifest locked'));
            }
            return remove(path, options);
        };
        await expect(fixture.run()).rejects.toThrow(
            `Removed: "${join(
                fixture.root,
                'a',
            )}".\nAlready missing: none.\nSkipped (kept): none.\nRemaining files: none.\nManifest "${fixture.manifestPath}": update failed`,
        );
        expect(await InstallManifest.load(fixture.manifestPath)).not.toBeNull();
    },
);

Deno.test(
    'Uninstall reports unknown remaining files if loading fails and known files if inspection fails',
    async () => {
        await using fixture = await setupUninstall();
        InstallManifest.inspect = (): never => {
            throw new Error('inspection failed');
        };
        await expect(fixture.run()).rejects.toThrow(
            `Remaining files: "${join(fixture.root, 'a')}"`,
        );
        await Deno.writeTextFile(fixture.manifestPath, '{');
        await expect(fixture.run()).rejects.toThrow(
            'Remaining files: unknown; inspect the installation manifest.',
        );
        expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('A');
    },
);

Deno.test(
    'Uninstall validates all names before resolving connectors and deduplicates selections',
    async () => {
        await using fixture = await setupUninstall({});
        for (const defaultHarness of [undefined, '', 'unknown']) {
            fixture.context.configuration.defaultHarness = defaultHarness;
            await expect(fixture.run()).rejects.toBeInstanceOf(UsageError);
        }
        await expect(fixture.run(['codex', 'unknown'])).rejects.toBeInstanceOf(UsageError);
        expect(fixture.events).toEqual([]);
        await fixture.run(['claude', 'codex', 'claude']);
        expect(fixture.events).toEqual([
            'get:claude',
            'dispose:claude',
            'get:codex',
            'dispose:codex',
        ]);
    },
);

Deno.test('Uninstall continues other harnesses after connector construction failure', async () => {
    await using fixture = await setupUninstall({});
    const get = Harness.get;
    Harness.get = (name, target) => {
        if (name === 'codex') {
            throw new Error('connector failed');
        }
        return get(name, target);
    };
    await expect(fixture.run(['codex', 'claude'])).rejects.toThrow(
        'Failed to uninstall instructions for codex: connector failed',
    );
    expect(fixture.events).toEqual(['get:claude', 'dispose:claude']);
});

Deno.test(
    'Uninstall checks cancellation before starting and reports progress after cancellation',
    async () => {
        await using fixture = await setupUninstall();
        const remove = Deno.remove;
        Deno.remove = async (path, options): Promise<void> => {
            await remove(path, options);
            if (path === join(fixture.root, 'a')) {
                fixture.controller.abort(new Error('cancelled'));
            }
        };
        await expect(fixture.run(['codex', 'claude'])).rejects.toThrow(
            `Removed: "${join(fixture.root, 'a')}".`,
        );
        expect(
            (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
        ).toEqual(['b', 'c']);
        expect(fixture.events).toEqual(['get:codex', 'dispose:codex']);
        await expect(fixture.run()).rejects.toThrow('cancelled');
        expect(fixture.events).toHaveLength(2);
    },
);

Deno.test('Uninstall rejects a manifest that tracks itself and unsafe file ancestors', async () => {
    await using fixture = await setupUninstall({ 'nested/a': 'A' });
    const manifest = await InstallManifest.load(fixture.manifestPath);
    expect(manifest).not.toBeNull();
    await Deno.rename(join(fixture.root, 'nested'), join(fixture.root, 'outside'));
    await Deno.symlink(join(fixture.root, 'outside'), join(fixture.root, 'nested'));
    await expect(fixture.run(['--force', '--yes'])).rejects.toThrow('symlink');
    expect(await Deno.readTextFile(join(fixture.root, 'outside/a'))).toBe('A');
    await InstallManifest.save(fixture.manifestPath, {
        version: 1,
        files: [{ path: Path.INSTALL_MANIFEST_NAME, checksum: '0'.repeat(64), size: 0 }],
    });
    await expect(fixture.run()).rejects.toThrow('Install manifest cannot track itself');
});

Deno.test(
    'Uninstall tolerates files and the manifest disappearing during uninstallation',
    async () => {
        await using fixture = await setupUninstall();
        const inspect = InstallManifest.inspect;
        InstallManifest.inspect = async (root, manifest) => {
            const inspections = await inspect(root, manifest);
            await Deno.remove(join(root, 'a'));
            return inspections;
        };
        await fixture.run();
        expect(fixture.messages).toContainEqual([
            'Uninstalled instructions for codex: 2 removed, 1 missing, 0 skipped.',
        ]);
        await Deno.writeTextFile(fixture.manifestPath, '{"version":1,"files":[]}');
        InstallManifest.load = () => Promise.resolve(null);
        await fixture.run();
        expect(fixture.messages).toContainEqual(['Nothing to uninstall for codex.']);
    },
);

Deno.test('Uninstall rejects symlink manifests without deleting tracked files', async () => {
    await using fixture = await setupUninstall();
    await Deno.rename(fixture.manifestPath, join(fixture.root, 'manifest-backup'));
    await Deno.symlink(join(fixture.root, 'manifest-backup'), fixture.manifestPath);
    await expect(fixture.run()).rejects.toThrow('Install manifest path contains a symlink');
    expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('A');
});

Deno.test(
    'Uninstall formats thrown values and persistence failures that are not Error objects',
    async () => {
        await using fixture = await setupUninstall();
        const remove = Deno.remove;
        Deno.remove = (path, options): Promise<void> => {
            if (path === join(fixture.root, 'b')) {
                return Promise.reject('removal failed');
            }
            return remove(path, options);
        };
        InstallManifest.save = (): Promise<void> => Promise.reject('disk full');
        await expect(fixture.run()).rejects.toThrow('Manifest persistence failed: disk full.');
        Harness.get = (): never => {
            throw 'connector failed';
        };
        await expect(fixture.run()).rejects.toThrow(
            'Failed to uninstall instructions for codex: connector failed',
        );
    },
);

Deno.test(
    'Uninstall retains skipped and pending files when removal fails after missing files',
    async () => {
        await using fixture = await setupUninstall();
        await Deno.remove(join(fixture.root, 'a'));
        await Deno.writeTextFile(join(fixture.root, 'b'), 'modified');
        const remove = Deno.remove;
        Deno.remove = (path, options): Promise<void> => {
            if (path === join(fixture.root, 'c')) {
                return Promise.reject(new Error('removal failed'));
            }
            return remove(path, options);
        };
        await expect(fixture.run(['--force', '--no'])).rejects.toThrow(
            `Already missing: "${join(fixture.root, 'a')}".\nSkipped (kept): "${join(
                fixture.root,
                'b',
            )}".\nRemaining files: "${join(fixture.root, 'c')}".`,
        );
        expect(
            (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
        ).toEqual(['b', 'c']);
    },
);

Deno.test(
    'Uninstall preserves unrelated nested files and rejects invalid tracked destinations',
    async () => {
        await using fixture = await setupUninstall({ 'nested/a': 'A' });
        await Deno.writeTextFile(join(fixture.root, 'nested/keep'), 'keep');
        await fixture.run();
        expect(await Deno.readTextFile(join(fixture.root, 'nested/keep'))).toBe('keep');
        await InstallManifest.save(fixture.manifestPath, {
            version: 1,
            files: [{ path: 'nested', checksum: '0'.repeat(64), size: 0 }],
        });
        await expect(fixture.run()).rejects.toThrow('Invalid installation path');
    },
);

Deno.test(
    'Uninstall tolerates removal races for tracked files and cleanup directories',
    async () => {
        for (const target of ['nested/a', 'nested']) {
            await using fixture = await setupUninstall({ 'nested/a': 'A' });
            const remove = Deno.remove;
            Deno.remove = async (path, options): Promise<void> => {
                await remove(path, options);
                if (path === join(fixture.root, target)) {
                    throw new Deno.errors.NotFound();
                }
            };
            await fixture.run();
            expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
        }
    },
);

Deno.test('Uninstall reports inspection and cleanup permission errors', async () => {
    await using fixture = await setupUninstall({ 'nested/a': 'A' });
    const lstat = Deno.lstat;
    try {
        Deno.lstat = () => Promise.reject(new Deno.errors.PermissionDenied('inspection denied'));
        await expect(fixture.run()).rejects.toThrow('inspection denied');
    } finally {
        Deno.lstat = lstat;
    }
    const remove = Deno.remove;
    Deno.remove = (path, options): Promise<void> => {
        if (path === join(fixture.root, 'nested')) {
            return Promise.reject(new Error('cleanup denied'));
        }
        return remove(path, options);
    };
    await expect(fixture.run()).rejects.toThrow('cleanup denied');
    expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
});

Deno.test('Uninstall reports a registered harness whose connector is unavailable', async () => {
    await using fixture = await setupUninstall();
    Harness.get = () => null;
    await expect(fixture.run()).rejects.toThrow('Unknown harness "codex".');
    expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('A');
});

Deno.test('Uninstall accepts only valueless --local and documents it', () => {
    const command = new Uninstall();
    expect(command.parseArguments(['--local']).args.local).toBe(true);
    expect(() => command.parseArguments(['--local=true'])).toThrow('does not take a value');
    expect(command.getUsage()).toContain('[--local]');
    expect(command.getUsage()).toContain('locally');
    expect(command.getUsage()).not.toContain('--self');
    for (const option of ['--self', '--self=value']) {
        expect(() => command.parseArguments([option])).toThrow(`Unknown option "${option}".`);
    }
});

Deno.test(
    'Uninstall rejects uninitialized local execution before constructing connectors',
    async () => {
        await using fixture = await setupUninstall();
        const get = Harness.get;
        let calls = 0;
        Harness.get = () => {
            calls++;
            return null;
        };
        await expect(fixture.run(['--local', 'codex'])).rejects.toThrow('cr init');
        expect(calls).toBe(0);
        expect((await InstallManifest.load(fixture.manifestPath))?.files).toHaveLength(3);
        expect(await Deno.readTextFile(join(fixture.root, 'a'))).toBe('A');
        Harness.get = get;
    },
);

Deno.test(
    'Uninstall passes one discovered local target to explicit and default harnesses',
    async () => {
        await using fixture = await setupUninstall();
        fixture.context.context.repositoryRoot = fixture.root;
        fixture.context.context.currentWorkingDirectory = join(fixture.root, 'nested');
        const get = Harness.get;
        const targets: unknown[] = [];
        Harness.get = (name, target) => {
            targets.push(target);
            return get(name, target);
        };
        await fixture.run(['--local']);
        await fixture.run(['--local', 'codex', 'claude']);
        expect(targets).toEqual(Array(3).fill({ scope: 'local', projectRoot: fixture.root }));
        targets.length = 0;
        await fixture.run([]);
        await fixture.run(['codex', 'claude']);
        expect(targets).toEqual(Array(3).fill({ scope: 'global' }));
        for (const args of [['--local', 'unknown'], ['--local']]) {
            fixture.context.configuration.defaultHarness = undefined;
            await expect(fixture.run(args)).rejects.toBeInstanceOf(UsageError);
        }
    },
);

Deno.test(
    'Real Claude protects existing and modified rules through install and uninstall confirmation',
    async () => {
        const get = Harness.get;
        await using fixture = await setupUninstall({});
        Harness.get = get;
        const override = Deno.env.get('CLAUDE_CONFIG_DIR');
        Deno.env.set('CLAUDE_CONFIG_DIR', join(fixture.root, '.claude'));
        try {
            const { Install } = await import('../../src/commands/install.ts');
            const install = new Install();
            fixture.context.context.installRoot = fixture.root;
            await Deno.mkdir(join(fixture.root, 'instructions'));
            await Deno.writeTextFile(
                join(fixture.root, 'instructions/AGENTS.md'),
                '<skill>example</skill>',
            );
            const home = join(fixture.root, '.claude');
            await Deno.mkdir(join(home, 'rules'), { recursive: true });
            const rule = join(home, 'rules/coderail.md');
            const manifest = join(home, Path.INSTALL_MANIFEST_NAME);
            await Deno.writeTextFile(rule, 'existing');
            const runInstall = async (args: string[]): Promise<void> => {
                await install.run({
                    ...fixture.context,
                    parsedArguments: install.parseArguments(['claude', ...args]),
                });
            };
            await runInstall([]);
            expect(await Deno.readTextFile(rule)).toBe('existing');
            expect(await InstallManifest.load(manifest)).toBeNull();
            await runInstall(['--force', '--no']);
            expect(await InstallManifest.load(manifest)).toBeNull();
            await runInstall(['--force', '--yes']);
            expect(await Deno.readTextFile(rule)).toBe('/example');
            await Deno.writeTextFile(rule, 'modified');
            const before = await Deno.readFile(manifest);
            await expect(fixture.run(['claude'])).rejects.toThrow('requires --force');
            expect(await Deno.readFile(manifest)).toEqual(before);
            await fixture.run(['claude', '--force', '--no']);
            expect(await Deno.readTextFile(rule)).toBe('modified');
            Log.confirm = () => false;
            Deno.stdin.isTerminal = () => true;
            fixture.context.configuration.nonInteractive = false;
            await fixture.run(['claude', '--force']);
            expect(await Deno.readTextFile(rule)).toBe('modified');
            Log.confirm = () => true;
            await fixture.run(['claude', '--force']);
            expect(await InstallManifest.load(manifest)).toBeNull();
            await expect(Deno.stat(rule)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        } finally {
            if (override === undefined) {
                Deno.env.delete('CLAUDE_CONFIG_DIR');
            } else {
                Deno.env.set('CLAUDE_CONFIG_DIR', override);
            }
        }
    },
);

for (const local of [false, true]) {
    for (const policy of [false, true]) {
        Deno.test(
            `Real Codex ${local ? 'local' : 'global'} protects whole ${policy ? 'invocation policies' : 'AGENTS.md files'} through install and uninstall confirmation`,
            async () => {
                const get = Harness.get;
                await using fixture = await setupUninstall({}, local);
                Harness.get = get;
                await Deno.remove(fixture.manifestPath);
                const override = Deno.env.get('CODEX_HOME');
                Deno.env.set(
                    'CODEX_HOME',
                    local ? 'invalid-relative' : join(fixture.root, '.codex'),
                );
                try {
                    const { Install } = await import('../../src/commands/install.ts');
                    const install = new Install();
                    fixture.context.context.installRoot = fixture.root;
                    await Deno.mkdir(join(fixture.root, 'instructions'));
                    await Deno.writeTextFile(
                        join(fixture.root, 'instructions/AGENTS.md'),
                        '<skill>example</skill>',
                    );
                    if (policy) {
                        await Deno.remove(join(fixture.root, 'instructions/AGENTS.md'));
                        await Deno.mkdir(join(fixture.root, 'instructions/skills/example'), {
                            recursive: true,
                        });
                        await Deno.writeTextFile(
                            join(fixture.root, 'instructions/skills/example/SKILL.md'),
                            '---\nname: example\ndescription: Example\ndisable-model-invocation: true\n---\nbody',
                        );
                    }
                    const expected = policy
                        ? 'policy:\n  allow_implicit_invocation: false\n'
                        : '$example';
                    const home = local ? fixture.root : join(fixture.root, '.codex');
                    await Deno.mkdir(home, { recursive: true });
                    const rule = join(
                        home,
                        policy
                            ? `${local ? '.codex/' : ''}skills/example/agents/openai.yaml`
                            : 'AGENTS.md',
                    );
                    if (policy) {
                        await Deno.mkdir(dirname(rule), { recursive: true });
                    }
                    const manifest = join(home, Path.INSTALL_MANIFEST_NAME);
                    await Deno.writeTextFile(rule, 'existing');
                    const runInstall = async (args: string[]): Promise<void> => {
                        await install.run({
                            ...fixture.context,
                            parsedArguments: install.parseArguments([
                                ...(local ? ['--local'] : []),
                                'codex',
                                ...args,
                            ]),
                        });
                    };
                    await runInstall([]);
                    expect(await Deno.readTextFile(rule)).toBe('existing');
                    expect(
                        (await InstallManifest.load(manifest))?.files.some((file) =>
                            file.path.endsWith(policy ? 'openai.yaml' : 'AGENTS.md'),
                        ) ?? false,
                    ).toBe(false);
                    await runInstall(['--force', '--no']);
                    expect(
                        (await InstallManifest.load(manifest))?.files.some((file) =>
                            file.path.endsWith(policy ? 'openai.yaml' : 'AGENTS.md'),
                        ) ?? false,
                    ).toBe(false);
                    Log.confirm = () => false;
                    await runInstall(['--force']);
                    expect(await Deno.readTextFile(rule)).toBe('existing');
                    Log.confirm = () => true;
                    await runInstall(['--force']);
                    expect(await Deno.readTextFile(rule)).toBe(expected);
                    await Deno.writeTextFile(rule, 'changed after installation');
                    await runInstall([]);
                    expect(await Deno.readTextFile(rule)).toBe('changed after installation');
                    await runInstall(['--force', '--yes']);
                    expect(await Deno.readTextFile(rule)).toBe(expected);
                    await Deno.writeTextFile(rule, 'modified');
                    const before = await Deno.readFile(manifest);
                    await expect(fixture.run(['codex'])).rejects.toThrow('requires --force');
                    expect(await Deno.readFile(manifest)).toEqual(before);
                    await fixture.run(['codex', '--force', '--no']);
                    expect(await Deno.readTextFile(rule)).toBe('modified');
                    Log.confirm = () => false;
                    Deno.stdin.isTerminal = () => true;
                    fixture.context.configuration.nonInteractive = false;
                    await fixture.run(['codex', '--force']);
                    expect(await Deno.readTextFile(rule)).toBe('modified');
                    Log.confirm = () => true;
                    await fixture.run(['codex', '--force']);
                    expect(await InstallManifest.load(manifest)).toBeNull();
                    await expect(Deno.stat(rule)).rejects.toBeInstanceOf(Deno.errors.NotFound);
                } finally {
                    if (override === undefined) {
                        Deno.env.delete('CODEX_HOME');
                    } else {
                        Deno.env.set('CODEX_HOME', override);
                    }
                }
            },
        );
    }
}
