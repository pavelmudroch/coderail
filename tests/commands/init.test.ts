import { Conf } from '@conf';
import { Log } from '@log';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { UsageError } from '../../src/cli/usage-error.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { Init } from '../../src/commands/init.ts';
import { Templates } from '../../src/templates.ts';

const defaultConfiguration = [
    '# Coderail configuration file, lines starting with "#" are comments.',
    '# Example:',
    '# default_harness = codex',
    '',
    '# Add your verification configuration here.',
    '# Example:',
    '# Optional global actions (place before rule entries):',
    '# [verify]',
    '# pre = [["mkdir", "-p", "coverage"]]',
    '# post = [["rm", "-rf", ".mutation-tmp"]]',
    '#',
    '# [[verify.rules]]',
    '# pattern = src/${path:**}/${file:*}.ts',
    '# commands = [',
    '#   ["command", "argument_1", "argument_2"]',
    '# ]',
    '',
].join('\n');

function context(
    root: string,
    args: string[] = [],
): RunContext<ReturnType<Init['parseArguments']>['args']> {
    return {
        context: { currentWorkingDirectory: root, installRoot: root },
        configuration: {
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: { rules: [] },
        },
        parsedArguments: new Init().parseArguments(args),
        signal: new AbortController().signal,
    };
}

Deno.test('Init creates a configuration scaffold and preserves it on repeated runs', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        const file = await Deno.open(path);
        expect((await Conf.parse(file.readable)).toObject()).toEqual({});
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        await Deno.writeTextFile(path, 'existing configuration');
        await Deno.writeTextFile(join(root, '.coderail', '.~config.lock'), 'other process');
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe('existing configuration');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init parses positional templates and literal arguments after --', () => {
    const command = new Init();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([])).toEqual({
        args: {
            help: false,
            force: false,
            yes: false,
            no: false,
            dry: false,
            dryPath: undefined,
            templates: [],
        },
        rest: [],
    });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: {
            help: false,
            force: false,
            yes: false,
            no: false,
            dry: false,
            dryPath: undefined,
            templates: [],
        },
        rest: [],
    });
    expect(command.parseArguments(['first', 'second', '--', '-literal', '--help'])).toEqual({
        args: {
            help: false,
            force: false,
            yes: false,
            no: false,
            dry: false,
            dryPath: undefined,
            templates: ['first', 'second', '-literal', '--help'],
        },
        rest: [],
    });
});

Deno.test('Init handles help and rejects invalid options', () => {
    const command = new Init();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments(['template', help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    expect(command.getUsage()).toContain(
        'cr init [--help] [--force [--yes | --no]] [<template> ...]',
    );
    for (const option of ['--unknown', '-x', '--help=value']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
});

Deno.test('Init accepts templates on fresh and existing configurations', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    const output = Log.output;
    const messages: unknown[][] = [];
    Log.output = (...args) => {
        messages.push(args);
    };
    try {
        const command = new Init();
        for (const name of ['first', 'second', 'third', 'fourth']) {
            const info = await Templates.create(root, name, '', new AbortController().signal);
            await Deno.writeTextFile(join(info.path, 'assets', name), name);
            await Deno.writeTextFile(join(info.path, 'config'), `default_harness = "${name}"`);
        }
        await command.run(context(root, ['first', 'second']));
        expect(await Deno.readTextFile(path)).toContain('default_harness = "second"');
        await command.run(context(root, ['third', 'fourth']));
        expect(await Deno.readTextFile(path)).toContain('default_harness = "fourth"');
        expect(messages.flat().join('\n')).toContain(`copy: ${join(root, 'first')}`);
        expect(messages.flat().join('\n')).toContain(`merge-config: ${path}`);
        for (const name of ['first', 'second', 'third', 'fourth']) {
            expect(await Deno.readTextFile(join(root, name))).toBe(name);
        }
    } finally {
        Log.output = output;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init fills an existing directory without replacing its contents', async () => {
    const root = await Deno.makeTempDir();
    const directory = join(root, '.coderail');
    try {
        await Deno.mkdir(directory);
        await Deno.writeTextFile(join(directory, 'existing'), 'preserved');
        await new Init().run(context(root));
        expect(await Deno.readTextFile(join(directory, 'config'))).toBe(defaultConfiguration);
        expect(await Deno.readTextFile(join(directory, 'existing'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a lock conflict and keeps the existing directory', async () => {
    const root = await Deno.makeTempDir();
    const directory = join(root, '.coderail');
    const lock = join(directory, '.~config.lock');
    try {
        await Deno.mkdir(directory);
        await Deno.writeTextFile(lock, 'another process');
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(
            Deno.errors.AlreadyExists,
        );
        expect(await Deno.readTextFile(lock)).toBe('another process');
        await expect(Deno.stat(join(directory, 'config'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a file blocking the configuration directory', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.writeTextFile(join(root, '.coderail'), 'preserved');
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(Error);
        expect(await Deno.readTextFile(join(root, '.coderail'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a directory blocking the configuration file', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    try {
        await Deno.mkdir(path, { recursive: true });
        await expect(new Init().run(context(root))).rejects.toThrow(
            `Expected "${path}" to be a file or a symlink.`,
        );
        expect((await Deno.stat(path)).isDirectory).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init preserves existing and dangling configuration symlinks', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    const target = join(root, 'existing.conf');
    try {
        await Deno.mkdir(join(root, '.coderail'));
        await Deno.writeTextFile(target, 'preserved');
        await Deno.symlink(target, path, { type: 'file' });
        await new Init().run(context(root));
        expect((await Deno.lstat(path)).isSymlink).toBe(true);
        expect(await Deno.readTextFile(target)).toBe('preserved');
        await Deno.remove(target);
        await new Init().run(context(root));
        expect(await Deno.readLink(path)).toBe(target);
        await expect(Deno.stat(target)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

const requiredIgnoreLines = [
    '*',
    '!.gitignore',
    '!config',
    '!plans/',
    '!plans/**',
    '!tickets/',
    '!tickets/**',
];

Deno.test('Init repairs ignore rules once while preserving custom content', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', '.gitignore');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(requiredIgnoreLines.join('\n') + '\n');
        for (const custom of [
            '',
            '# custom\n*\n!plans/\ncustom',
            '*\n# custom\n!tickets/\n',
            '# custom\r\n*\r\n',
        ]) {
            await Deno.writeTextFile(path, custom);
            const expected = custom.startsWith('*\n') ? custom : '*\n' + custom;
            const missing = requiredIgnoreLines
                .slice(1)
                .filter((line) => !custom.split(/\r?\n/).includes(line));
            const repaired =
                expected + (expected.endsWith('\n') ? '' : '\n') + missing.join('\n') + '\n';
            await command.run(context(root));
            expect(await Deno.readTextFile(path)).toBe(repaired);
            await command.run(context(root));
            expect(await Deno.readTextFile(path)).toBe(repaired);
        }
        const complete = requiredIgnoreLines.join('\n') + '\n# custom\nplans/**';
        await Deno.writeTextFile(path, complete);
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(complete);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init ignores runtime output without untracking existing files', async () => {
    const root = await Deno.makeTempDir();
    async function git(...args: string[]): Promise<string> {
        const result = await new Deno.Command('git', {
            args: ['-C', root, ...args],
            stdout: 'piped',
            stderr: 'piped',
        }).output();
        expect(result.code).toBe(0);
        return new TextDecoder().decode(result.stdout);
    }
    try {
        await git('init', '-q');
        await Deno.mkdir(join(root, '.coderail'));
        await Deno.writeTextFile(join(root, '.coderail', 'tracked-runtime'), 'tracked');
        await git('add', '.');
        await Deno.writeTextFile(join(root, '.gitignore'), '# root rules\n');
        const exclude = await Deno.readTextFile(join(root, '.git', 'info', 'exclude'));
        await new Init().run(context(root));
        const visible = [
            '.gitignore',
            'config',
            'plans/IDEA.md',
            'plans/nested/content.md',
            'tickets/open/ticket.md',
            'tickets/nested/deep/content.md',
        ];
        for (const path of [...visible, 'output/run/log.txt', 'runtime.json']) {
            const target = join(root, '.coderail', path);
            await Deno.mkdir(join(target, '..'), { recursive: true });
            if (!['.gitignore', 'config'].includes(path)) {
                await Deno.writeTextFile(target, 'content');
            }
        }
        const eligible = (await git('ls-files', '--others', '--exclude-standard', '.coderail'))
            .trim()
            .split('\n');
        expect(eligible.sort()).toEqual(visible.map((path) => '.coderail/' + path).sort());
        expect(await git('ls-files', '.coderail/tracked-runtime')).toBe(
            '.coderail/tracked-runtime\n',
        );
        expect(await Deno.readTextFile(join(root, '.gitignore'))).toBe('# root rules\n');
        expect(await Deno.readTextFile(join(root, '.git', 'info', 'exclude'))).toBe(exclude);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init propagates ignore file read errors', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, '.coderail', '.gitignore'), { recursive: true });
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(
            Deno.errors.IsADirectory,
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'Init uses the effective cwd and propagates template errors and cancellation',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const target = join(root, 'effective-cwd');
            await Deno.mkdir(target);
            const run = context(target, ['missing']);
            run.context.installRoot = root;
            await expect(new Init().run(run)).rejects.toThrow('missing');
            expect((await Deno.stat(join(target, '.coderail'))).isDirectory).toBe(true);
            await expect(Deno.stat(join(root, '.coderail'))).rejects.toThrow();
            run.signal = AbortSignal.abort();
            await expect(new Init().run(run)).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('Init validates force and automatic answer flags', () => {
    const command = new Init();
    for (const flags of [
        ['--force', '--yes'],
        ['-f', '-y'],
        ['--force', '--no'],
        ['-f', '-n'],
    ]) {
        const args = command.parseArguments(flags).args;
        expect(args.force).toBe(true);
        expect(args.yes).toBe(flags[1] === '--yes' || flags[1] === '-y');
        expect(args.no).toBe(flags[1] === '--no' || flags[1] === '-n');
    }
    for (const flags of [
        ['--yes'],
        ['--no'],
        ['--force', '--yes', '--no'],
        ['--force=x'],
        ['--yes=x'],
        ['--no=x'],
    ]) {
        expect(() => command.parseArguments(flags)).toThrow(UsageError);
    }
});

Deno.test(
    'Init prompts only for differing files and supports automatic and noninteractive decisions',
    async () => {
        const confirm = Log.confirm;
        const terminal = Deno.stdin.isTerminal;
        try {
            for (const mode of [
                'yes',
                'no',
                'accept',
                'decline',
                'configured',
                'terminal',
                'normal',
                'clean',
            ]) {
                const root = await Deno.makeTempDir();
                let calls = 0;
                try {
                    const info = await Templates.create(
                        root,
                        'template',
                        '',
                        new AbortController().signal,
                    );
                    await Deno.writeTextFile(join(info.path, 'assets', 'a-new'), 'new');
                    await Deno.writeTextFile(
                        join(info.path, 'assets', 'z-conflict'),
                        'replacement',
                    );
                    if (mode !== 'clean') {
                        await Deno.writeTextFile(join(root, 'z-conflict'), 'original');
                    }
                    Log.confirm = (message) => {
                        expect(message).toContain(join(root, 'z-conflict'));
                        expect(Deno.readTextFileSync(join(root, 'z-conflict'))).toBe('original');
                        expect(() => Deno.statSync(join(root, 'a-new'))).toThrow();
                        calls++;
                        return mode === 'accept';
                    };
                    Deno.stdin.isTerminal = () =>
                        !['terminal', 'clean', 'yes', 'no'].includes(mode);
                    const flags = mode === 'normal' ? [] : ['--force'];
                    if (mode === 'yes' || mode === 'no') {
                        flags.push('--' + mode);
                    }
                    const run = context(root, [...flags, 'template']);
                    run.configuration.nonInteractive = [
                        'configured',
                        'clean',
                        'yes',
                        'no',
                    ].includes(mode);
                    if (['configured', 'terminal', 'normal'].includes(mode)) {
                        try {
                            await new Init().run(run);
                            throw new Error('Expected conflict failure');
                        } catch (error) {
                            expect(error).toBeInstanceOf(Error);
                            if (mode !== 'normal') {
                                expect(String((error as Error).cause)).toContain(
                                    '--force --yes or --force --no',
                                );
                            } else {
                                expect(String((error as Error).cause)).toContain(
                                    'Template asset conflict',
                                );
                            }
                        }
                        await expect(Deno.stat(join(root, 'a-new'))).rejects.toThrow();
                    } else {
                        await new Init().run(run);
                        expect(await Deno.readTextFile(join(root, 'z-conflict'))).toBe(
                            ['yes', 'accept', 'clean'].includes(mode) ? 'replacement' : 'original',
                        );
                        expect(await Deno.readTextFile(join(root, 'a-new'))).toBe('new');
                    }
                    expect(calls).toBe(['accept', 'decline'].includes(mode) ? 1 : 0);
                } finally {
                    await Deno.remove(root, { recursive: true });
                }
            }
        } finally {
            Log.confirm = confirm;
            Deno.stdin.isTerminal = terminal;
        }
    },
);

Deno.test(
    'Init parses optional dry directories and preserves option and literal boundaries',
    () => {
        const command = new Init();
        for (const [input, templates, path] of [
            [['my-template', '--dry'], ['my-template'], undefined],
            [['my-template', '--dry', './preview'], ['my-template'], './preview'],
            [['--dry', 'my-template'], [], 'my-template'],
            [['my-template', '--dry', '--force'], ['my-template'], undefined],
            [['--dry', '--', 'literal'], ['literal'], undefined],
            [['--', '--dry'], ['--dry'], undefined],
        ] as const) {
            const args = command.parseArguments(input).args;
            expect(args.templates).toEqual(templates);
            expect(args.dryPath).toBe(path);
            expect(args.dry).toBe(input[0] !== '--');
        }
        for (const flags of [
            ['--dry', '--yes'],
            ['--dry', '--force', '--yes', '--no'],
            ['--dry=x'],
        ]) {
            expect(() => command.parseArguments(flags)).toThrow(UsageError);
        }
    },
);

Deno.test(
    'Init preview reports every conflict without prompting even with automatic answers',
    async () => {
        const root = await Deno.makeTempDir();
        const confirm = Log.confirm;
        const output = Log.output;
        const messages: string[] = [];
        try {
            const template = await Templates.create(
                root,
                'example',
                '',
                new AbortController().signal,
            );
            for (const name of ['a', 'b']) {
                await Deno.writeTextFile(join(template.path, 'assets', name), 'replacement');
                await Deno.writeTextFile(join(root, name), 'original');
            }
            await Deno.writeTextFile(
                join(template.path, 'startup.ts'),
                'throw new Error("must not run");',
            );
            Log.confirm = () => {
                throw new Error('must not prompt');
            };
            Log.output = (...args) => {
                messages.push(args.join(' '));
            };
            for (const flags of [[], ['--force'], ['--force', '--yes'], ['--force', '--no']]) {
                messages.length = 0;
                await expect(
                    new Init().run(context(root, ['example', '--dry', ...flags])),
                ).rejects.toThrow('conflict');
                for (const name of ['a', 'b']) {
                    expect(messages.join('\n')).toContain(`conflict: ${join(root, name)}`);
                    expect(await Deno.readTextFile(join(root, name))).toBe('original');
                }
                expect(messages.join('\n')).toContain('startup:');
                await expect(Deno.stat(join(root, '.coderail'))).rejects.toThrow();
            }
        } finally {
            Log.confirm = confirm;
            Log.output = output;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Init dry directory applies under effective cwd with normal overwrite rules',
    async () => {
        const root = await Deno.makeTempDir();
        const confirm = Log.confirm;
        const terminal = Deno.stdin.isTerminal;
        try {
            const template = await Templates.create(
                root,
                'example',
                '',
                new AbortController().signal,
            );
            await Deno.writeTextFile(join(template.path, 'assets', 'input'), 'new');
            await Deno.writeTextFile(join(template.path, 'config'), 'no_color = true');
            await Deno.writeTextFile(
                join(template.path, 'startup.ts'),
                "await Deno.writeTextFile('output', Deno.cwd() + ':' + await Deno.readTextFile('input'));",
            );
            const cwd = join(root, 'effective');
            await Deno.mkdir(cwd);
            const target = join(cwd, 'preview');
            for (const flag of ['--yes', '--no', '--yes']) {
                const run = context(cwd, ['example', '--dry', './preview', '--force', flag]);
                run.context.installRoot = root;
                await new Init().run(run);
                expect(await Deno.readTextFile(join(target, '.coderail', 'config'))).toContain(
                    'no_color = true',
                );
                expect(await Deno.readTextFile(join(target, 'output'))).toBe(
                    target + ':' + (flag === '--no' ? 'old' : 'new'),
                );
                await Deno.writeTextFile(join(target, 'input'), 'old');
            }
            for (const answer of [false, true]) {
                let calls = 0;
                Log.confirm = (message) => {
                    expect(message).toContain(join(target, 'input'));
                    calls++;
                    return answer;
                };
                Deno.stdin.isTerminal = () => true;
                const interactive = context(cwd, ['example', '--dry', './preview', '--force']);
                interactive.context.installRoot = root;
                await new Init().run(interactive);
                expect(calls).toBe(1);
                expect(await Deno.readTextFile(join(target, 'input'))).toBe(answer ? 'new' : 'old');
                await Deno.writeTextFile(join(target, 'input'), 'old');
            }
            const run = context(cwd, ['example', '--dry', './preview', '--force']);
            run.context.installRoot = root;
            run.configuration.nonInteractive = true;
            await expect(new Init().run(run)).rejects.toThrow();
            await Deno.writeTextFile(join(cwd, 'blocked'), 'file');
            await expect(
                new Init().run(context(cwd, ['--dry', 'blocked/nested'])),
            ).rejects.toThrow();
            await new Init().run(context(cwd, ['--dry', 'empty']));
            expect((await Deno.stat(join(cwd, 'empty', '.coderail', 'config'))).isFile).toBe(true);
            await expect(Deno.stat(join(cwd, '.coderail'))).rejects.toThrow();
        } finally {
            Log.confirm = confirm;
            Deno.stdin.isTerminal = terminal;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Init previews a missing project and template startup without creating anything',
    async () => {
        const root = await Deno.makeTempDir();
        const output = Log.output;
        const messages: string[] = [];
        try {
            const template = await Templates.create(
                root,
                'example',
                '',
                new AbortController().signal,
            );
            await Deno.writeTextFile(join(template.path, 'assets', 'input'), 'asset');
            await Deno.writeTextFile(
                join(template.path, 'startup.ts'),
                "await Deno.readTextFile('input'); await Deno.writeTextFile('started', 'yes');",
            );
            const target = join(root, 'missing');
            const run = context(target, ['example', '--dry']);
            run.context.installRoot = root;
            Log.output = (...args) => {
                messages.push(args.join(' '));
            };
            await new Init().run(run);
            expect(messages.join('\n')).toContain(`copy: ${join(target, 'input')}`);
            expect(messages.join('\n')).toContain('Startup effects are not simulated');
            await expect(Deno.stat(target)).rejects.toThrow();
            await new Init().run(context(target, ['--dry']));
            await expect(Deno.stat(target)).rejects.toThrow();
        } finally {
            Log.output = output;
            await Deno.remove(root, { recursive: true });
        }
    },
);
