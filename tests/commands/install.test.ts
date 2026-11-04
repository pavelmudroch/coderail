import { Fs } from '@fs';
import { type ConnectorFile, Harness } from '@harness';
import { InstallManifest } from '@install-manifest';
import { Log } from '@log';
import { Path } from '@path';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { UsageError } from '../../src/cli/usage-error.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { Install } from '../../src/commands/install.ts';
import { Uninstall } from '../../src/commands/uninstall.ts';
import { createContext } from '../../src/runtime/context.ts';

Deno.test('Install parses optional harnesses and flags', () => {
    const command = new Install();
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

Deno.test('Install handles help and rejects invalid options', () => {
    const command = new Install();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    for (const option of ['--unknown', '-x', '--help=value', '--force=false', '--yes=true']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
    expect(command.getUsage()).toContain(
        'cr install [--help] [--local] [--force [--yes | --no]] [<harness> ...]',
    );
    for (const harness of Harness.names) {
        expect(command.getUsage()).toContain(`- ${harness}`);
    }
});

Deno.test('Install validates confirmation policy', () => {
    const command = new Install();
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

type InstallContext = RunContext<ReturnType<Install['parseArguments']>['args']>;

type InstallFixture = AsyncDisposable & {
    root: string;
    home: string;
    files: ConnectorFile[];
    errors: unknown[][];
    messages: unknown[][];
    names: string[];
    context: InstallContext;
    manifestPath: string;
    run(args?: string[]): Promise<void>;
};

async function setupInstall(local = false): Promise<InstallFixture> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const home = join(root, 'home');
    const instructions = join(root, Path.INSTRUCTIONS_DIR);
    await Deno.mkdir(join(instructions, 'skills'), { recursive: true });
    await Deno.mkdir(join(instructions, 'agents'));
    await Deno.writeTextFile(join(instructions, 'AGENTS.md'), 'instructions');
    const files: ConnectorFile[] = [
        { path: 'nested/a', content: new TextEncoder().encode('A') },
        { path: 'b', content: new TextEncoder().encode('B') },
    ];
    const original = {
        get: Harness.get,
        error: Log.error,
        output: Log.output,
        confirm: Log.confirm,
        write: Fs.write,
        save: InstallManifest.save,
    };
    const messages: unknown[][] = [];
    const errors: unknown[][] = [];
    const names: string[] = [];
    Harness.get = (name, _target) => {
        if (!Harness.names.includes(name)) {
            return null;
        }
        names.push(name);
        return {
            name,
            home,
            translateSkill: () => Promise.resolve([]),
            translateSubagent: () => Promise.resolve([]),
            translateGlobalInstructions: () => Promise.resolve(files),
            [Symbol.dispose](): void {},
        };
    };
    Log.error = (...values): void => {
        errors.push(values);
    };
    Log.output = (...values): void => {
        messages.push(values);
    };
    const command = new Install();
    const context: InstallContext = {
        context: { currentWorkingDirectory: root, installRoot: root },
        configuration: {
            defaultHarness: 'codex',
            logLevel: 'normal',
            noColor: false,
            nonInteractive: true,
            verify: { rules: [] },
        },
        parsedArguments: command.parseArguments([]),
        signal: new AbortController().signal,
    };
    if (local) {
        await Deno.mkdir(join(root, '.coderail'), { recursive: true });
        context.context.repositoryRoot = root;
    }
    return {
        root,
        home,
        files,
        errors,
        messages,
        names,
        context,
        manifestPath: join(home, Path.INSTALL_MANIFEST_NAME),
        async run(args: string[] = []): Promise<void> {
            context.parsedArguments = command.parseArguments(local ? ['--local', ...args] : args);
            await command.run(context);
        },
        async [Symbol.asyncDispose](): Promise<void> {
            Harness.get = original.get;
            Log.error = original.error;
            Log.output = original.output;
            Log.confirm = original.confirm;
            Fs.write = original.write;
            InstallManifest.save = original.save;
            await Deno.remove(root, { recursive: true });
        },
    };
}

Deno.test(
    'Install creates a missing home, selects the default, and updates tracked files',
    async () => {
        await using fixture = await setupInstall();
        await fixture.run();
        expect(fixture.names).toEqual(['codex']);
        expect(fixture.errors).toEqual([]);
        expect(await Deno.readTextFile(join(fixture.home, 'nested/a'))).toBe('A');
        fixture.files[0] = { path: 'nested/a', content: new TextEncoder().encode('updated') };
        await fixture.run(['claude']);
        expect(await Deno.readTextFile(join(fixture.home, 'nested/a'))).toBe('updated');
        const manifest = await InstallManifest.load(fixture.manifestPath);
        expect(manifest).toEqual(await InstallManifest.capture(fixture.home, ['nested/a', 'b']));
        expect(fixture.errors).toEqual([]);
    },
);

Deno.test('Install validates explicit and default harnesses', async () => {
    await using fixture = await setupInstall();
    for (const defaultHarness of [undefined, 'unknown']) {
        fixture.context.configuration.defaultHarness = defaultHarness;
        await expect(fixture.run()).rejects.toBeInstanceOf(UsageError);
    }
    await expect(fixture.run(['unknown'])).rejects.toBeInstanceOf(UsageError);
    expect(fixture.names).toEqual([]);
});

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Install plans all files before writing and protects untracked destinations`,
        async () => {
            await using fixture = await setupInstall(local);
            await Deno.mkdir(fixture.home);
            await Deno.writeTextFile(join(fixture.home, 'b'), 'user');
            await fixture.run();
            expect(fixture.errors).toHaveLength(1);
            await expect(Deno.stat(join(fixture.home, 'nested/a'))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );
            expect(await InstallManifest.load(fixture.manifestPath)).toBeNull();
            await fixture.run(['--force', '--no']);
            expect(await Deno.readTextFile(join(fixture.home, 'b'))).toBe('user');
            expect(
                (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
            ).toEqual(['nested/a']);
            await fixture.run(['--force', '--yes']);
            expect(await Deno.readTextFile(join(fixture.home, 'b'))).toBe('B');
        },
    );
}

for (const local of [false, true]) {
    Deno.test(
        `${local ? 'Local' : 'Global'} Install preserves skipped checksums and entries absent from new translations`,
        async () => {
            await using fixture = await setupInstall(local);
            await fixture.run();
            const before = await InstallManifest.load(fixture.manifestPath);
            await Deno.writeTextFile(join(fixture.home, 'nested/a'), 'user');
            fixture.files.pop();
            await fixture.run();
            expect(fixture.errors).toHaveLength(1);
            await fixture.run(['--force', '--no']);
            expect(await InstallManifest.load(fixture.manifestPath)).toEqual(before);
            expect(fixture.messages).toContainEqual(['No instructions installed for codex.']);
            const prompts: string[] = [];
            Log.confirm = (message): boolean => {
                prompts.push(message);
                return false;
            };
            await fixture.run(['--force']);
            expect(await Deno.readTextFile(join(fixture.home, 'nested/a'))).toBe('user');
            Log.confirm = (): boolean => true;
            await fixture.run(['--force']);
            expect(prompts).toHaveLength(1);
            expect(await Deno.readTextFile(join(fixture.home, 'nested/a'))).toBe('A');
            expect((await InstallManifest.load(fixture.manifestPath))?.files).toHaveLength(2);
        },
    );
}

Deno.test(
    'Install rejects unsafe, duplicate, reserved, and conflicting translated paths before writing',
    async () => {
        await using fixture = await setupInstall();
        for (const paths of [
            ['../outside'],
            ['/absolute'],
            ['a/../b'],
            ['a\\b'],
            ['a', 'a'],
            ['a', 'a/b'],
            [Path.INSTALL_MANIFEST_NAME],
            [`${Path.INSTALL_MANIFEST_NAME}/a`],
        ]) {
            fixture.files.splice(
                0,
                fixture.files.length,
                ...paths.map((path) => ({ path, content: new Uint8Array() })),
            );
            await fixture.run(['--force', '--yes']);
            await expect(Deno.stat(fixture.home)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        }
        expect(fixture.errors).toHaveLength(8);
    },
);

Deno.test(
    'Install rejects symlinks, directories at destinations, and symlink manifests',
    async () => {
        await using fixture = await setupInstall();
        await Deno.mkdir(fixture.home);
        const outside = join(fixture.root, 'outside');
        await Deno.mkdir(outside);
        await Deno.symlink(outside, join(fixture.home, 'nested'));
        await fixture.run(['--force', '--yes']);
        await expect(Deno.stat(join(outside, 'a'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
        await Deno.remove(join(fixture.home, 'nested'));
        await Deno.mkdir(join(fixture.home, 'b'));
        await fixture.run(['--force', '--yes']);
        await expect(Deno.stat(join(fixture.home, 'nested'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
        await Deno.remove(join(fixture.home, 'b'));
        await Deno.writeTextFile(join(outside, 'manifest'), '{}');
        await Deno.symlink(join(outside, 'manifest'), fixture.manifestPath);
        await fixture.run(['--force', '--yes']);
        expect(fixture.errors).toHaveLength(3);
        expect(await Deno.readTextFile(join(outside, 'manifest'))).toBe('{}');
    },
);

Deno.test(
    'Install persists successful writes after a later failure and aggregates persistence errors',
    async () => {
        await using fixture = await setupInstall();
        const write = Fs.write;
        Fs.write = (path, content): Promise<void> => {
            if (path === join(fixture.home, 'b')) {
                return Promise.reject(new Error('write failed'));
            }
            return write(path, content);
        };
        await fixture.run();
        expect(
            (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
        ).toEqual(['nested/a']);
        const failure = fixture.errors[0]?.[1];
        expect(failure).toBeInstanceOf(AggregateError);
        InstallManifest.save = (): Promise<void> => Promise.reject(new Error('save failed'));
        await fixture.run();
        const combined = fixture.errors[1]?.[1];
        expect(combined).toBeInstanceOf(AggregateError);
        expect((combined as AggregateError).errors).toHaveLength(2);
    },
);

Deno.test('Install leaves files untouched after translation failure', async () => {
    await using fixture = await setupInstall();
    const get = Harness.get;
    Harness.get = (name, target) => {
        const harness = get(name, target);
        if (harness) {
            harness.translateGlobalInstructions = () =>
                Promise.reject(new Error('translation failed'));
        }
        return harness;
    };
    await fixture.run();
    expect(fixture.errors).toHaveLength(1);
    await expect(Deno.stat(fixture.home)).rejects.toBeInstanceOf(Deno.errors.NotFound);
});

Deno.test('Install translates skills and subagents with their source bytes', async () => {
    await using fixture = await setupInstall();
    const instructions = join(fixture.root, Path.INSTRUCTIONS_DIR);
    await Deno.mkdir(join(instructions, 'skills/example'));
    await Deno.writeTextFile(join(instructions, 'skills/example/SKILL.md'), 'skill');
    await Deno.writeTextFile(join(instructions, 'agents/example.md'), 'agent');
    const get = Harness.get;
    const translated: string[] = [];
    Harness.get = (name, target) => {
        const harness = get(name, target);
        if (harness) {
            harness.translateSkill = (name, files) => {
                translated.push(name);
                return Promise.resolve(
                    files.map((file) => ({ ...file, path: `skills/${name}/${file.path}` })),
                );
            };
            harness.translateSubagent = (file) =>
                Promise.resolve([{ ...file, path: `agents/${file.path}` }]);
        }
        return harness;
    };
    await fixture.run();
    expect(translated).toEqual(['example']);
    expect(await Deno.readTextFile(join(fixture.home, 'skills/example/SKILL.md'))).toBe('skill');
    expect(await Deno.readTextFile(join(fixture.home, 'agents/example.md'))).toBe('agent');
    expect(fixture.errors).toEqual([]);
});

Deno.test('Install reports filesystem inspection errors without writing files', async () => {
    await using fixture = await setupInstall();
    const lstat = Deno.lstat;
    const failure = new Deno.errors.PermissionDenied('cannot inspect');
    Deno.lstat = (path): Promise<Deno.FileInfo> => {
        if (path === fixture.home) {
            return Promise.reject(failure);
        }
        return lstat(path);
    };
    try {
        await fixture.run();
        expect(fixture.errors[0]?.[1]).toBe(failure);
    } finally {
        Deno.lstat = lstat;
    }
    await expect(Deno.stat(fixture.home)).rejects.toBeInstanceOf(Deno.errors.NotFound);
});

Deno.test(
    'Install restores missing tracked files and rejects conflicts with retained manifest paths',
    async () => {
        await using fixture = await setupInstall();
        await fixture.run();
        await Deno.remove(join(fixture.home, 'nested/a'));
        await fixture.run();
        expect(await Deno.readTextFile(join(fixture.home, 'nested/a'))).toBe('A');
        await Deno.remove(join(fixture.home, 'nested'), { recursive: true });
        fixture.files.splice(0, fixture.files.length, {
            path: 'nested',
            content: new TextEncoder().encode('replacement'),
        });
        await fixture.run(['--force', '--yes']);
        expect(fixture.errors).toHaveLength(1);
        expect(
            (await InstallManifest.load(fixture.manifestPath))?.files.map((file) => file.path),
        ).toEqual(['nested/a', 'b']);
        await expect(Deno.stat(join(fixture.home, 'nested'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
    },
);

Deno.test(
    'Install reads the runtime resource root for source and flattened distributions',
    async () => {
        for (const layout of ['assets', 'distribution']) {
            await using fixture = await setupInstall();
            const resourceRoot = join(fixture.root, layout);
            await Deno.mkdir(resourceRoot);
            await Deno.rename(
                join(fixture.root, 'instructions'),
                join(resourceRoot, 'instructions'),
            );
            fixture.context.context.resourceRoot = resourceRoot;
            await fixture.run();
            expect(fixture.errors).toEqual([]);
            expect(await Deno.readTextFile(join(fixture.home, 'b'))).toBe('B');
        }
    },
);

Deno.test('Install accepts only valueless --local and documents it', () => {
    const command = new Install();
    expect(command.parseArguments(['--local']).args.local).toBe(true);
    expect(() => command.parseArguments(['--local=true'])).toThrow('does not take a value');
    expect(command.getUsage()).toContain('[--local]');
    expect(command.getUsage()).toContain('locally');
    expect(command.getUsage()).not.toContain('--self');
});

Deno.test(
    'Install rejects uninitialized local execution before constructing connectors',
    async () => {
        await using fixture = await setupInstall();
        const get = Harness.get;
        let calls = 0;
        Harness.get = () => {
            calls++;
            return null;
        };
        await expect(fixture.run(['--local', 'codex'])).rejects.toThrow('cr init');
        expect(calls).toBe(0);
        await expect(Deno.stat(fixture.home)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        Harness.get = get;
    },
);

Deno.test(
    'Install passes one discovered local target to explicit and default harnesses',
    async () => {
        await using fixture = await setupInstall();
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

Deno.test('Local commands discover the nearest project using global cwd', async () => {
    await using fixture = await setupInstall();
    const outer = join(fixture.root, 'outer');
    const inner = join(outer, 'inner');
    const child = join(inner, 'child');
    await Deno.mkdir(join(outer, '.coderail'), { recursive: true });
    await Deno.mkdir(join(inner, '.coderail'), { recursive: true });
    await Deno.mkdir(child);
    for (const command of [new Install(), new Uninstall()]) {
        const context = await createContext(
            {
                cwd: child,
                help: false,
                version: false,
                nonInteractive: true,
                noColor: false,
                verbose: false,
                quiet: false,
            },
            command,
        );
        expect(context.repositoryRoot).toBe(inner);
        const get = Harness.get;
        const targets: unknown[] = [];
        Harness.get = (name, target) => {
            targets.push(target);
            return get(name, target);
        };
        await command.run({
            ...fixture.context,
            context: { ...context, resourceRoot: fixture.root },
            parsedArguments: command.parseArguments(['--local']),
        });
        expect(targets).toEqual([{ scope: 'local', projectRoot: inner }]);
        Harness.get = get;
    }
});

Deno.test(
    'Concrete local and global installs coexist across harnesses and round trip safely',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const originalHome = Deno.env.get('HOME');
        const originalOutput = Log.output;
        Deno.env.set('HOME', join(root, 'user'));
        Log.output = () => {};
        try {
            const project = join(root, 'project');
            const resources = join(root, 'resources');
            await Deno.mkdir(join(project, '.coderail'), { recursive: true });
            await Deno.mkdir(join(resources, 'instructions/skills/example'), { recursive: true });
            await Deno.mkdir(join(resources, 'instructions/agents'));
            await Deno.writeTextFile(join(resources, 'instructions/AGENTS.md'), 'instructions');
            await Deno.writeTextFile(
                join(resources, 'instructions/skills/example/SKILL.md'),
                'skill',
            );
            const context = {
                context: {
                    currentWorkingDirectory: project,
                    repositoryRoot: project,
                    installRoot: resources,
                },
                configuration: {
                    defaultHarness: 'codex',
                    logLevel: 'normal' as const,
                    noColor: false,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                signal: new AbortController().signal,
            };
            const install = new Install();
            const uninstall = new Uninstall();
            const run = async (command: Install | Uninstall, args: string[]): Promise<void> => {
                await command.run({ ...context, parsedArguments: command.parseArguments(args) });
            };
            for (const scope of [[], ['--local']]) {
                await run(install, [...scope, 'codex', 'claude']);
            }
            const homes = [
                join(root, 'user'),
                join(root, 'user/.claude'),
                project,
                join(project, '.claude'),
            ];
            for (const home of homes) {
                const manifest = await InstallManifest.load(join(home, Path.INSTALL_MANIFEST_NAME));
                if (manifest === null) {
                    throw new Error('Installation manifest is missing');
                }
                expect(manifest.files).toHaveLength(2);
                expect(
                    (await InstallManifest.inspect(home, manifest)).every(
                        (file) => file.status === 'unchanged',
                    ),
                ).toBe(true);
            }
            await Deno.writeTextFile(join(project, 'unrelated'), 'keep');
            await run(uninstall, ['--local', 'codex']);
            await expect(Deno.stat(join(project, 'AGENTS.md'))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );
            await expect(
                Deno.stat(join(project, Path.INSTALL_MANIFEST_NAME)),
            ).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect(await Deno.readTextFile(join(project, '.claude/CLAUDE.md'))).toBe(
                'instructions',
            );
            for (const home of homes.slice(0, 2)) {
                expect(
                    await InstallManifest.load(join(home, Path.INSTALL_MANIFEST_NAME)),
                ).not.toBeNull();
            }
            await run(uninstall, ['claude']);
            expect(await Deno.readTextFile(join(project, '.claude/CLAUDE.md'))).toBe(
                'instructions',
            );
            await run(uninstall, ['--local', 'claude']);
            await run(uninstall, ['codex']);
            for (const home of homes) {
                expect(
                    await InstallManifest.load(join(home, Path.INSTALL_MANIFEST_NAME)),
                ).toBeNull();
            }
            expect(await Deno.readTextFile(join(project, 'unrelated'))).toBe('keep');
        } finally {
            Log.output = originalOutput;
            if (originalHome === undefined) {
                Deno.env.delete('HOME');
            } else {
                Deno.env.set('HOME', originalHome);
            }
            await Deno.remove(root, { recursive: true });
        }
    },
);
