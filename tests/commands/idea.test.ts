import { expect } from '@std/expect';
import { join } from '@std/path';
import { Commands } from '@commands';
import { Log } from '@log';
import { UsageError } from '../../src/cli/usage-error.ts';
import { Idea } from '../../src/commands/idea.ts';
import { Create } from '../../src/commands/idea/create.ts';
import { Split } from '../../src/commands/idea/split.ts';
import { Ready } from '../../src/commands/idea/ready.ts';
import { Reforge } from '../../src/commands/idea/reforge.ts';
import { runStub } from './idea/helpers.ts';

Deno.test('Idea creates the plans directory and preserves existing contents', async () => {
    const root = await Deno.makeTempDir();
    const plans = join(root, '.coderail', 'plans');
    try {
        const command = new Idea();
        await runStub(command, root);
        expect((await Deno.stat(plans)).isDirectory).toBe(true);
        const existing = join(plans, 'existing');
        await Deno.writeTextFile(existing, 'preserved');
        await runStub(command, root);
        expect(await Deno.readTextFile(existing)).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
Deno.test('Idea handles parent help and stops before child arguments', () => {
    const command = new Idea();
    expect(command.requiresInit).toBe(true);
    expect(command.parseArguments([])).toEqual({ args: { help: false, json: false }, rest: [] });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: { help: false, json: false },
        rest: [],
    });
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, 'create', '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
        expect(parsed.rest).toEqual([]);
        const childArguments = command.parseArguments(['create', help, 'argument']);
        expect(command.shouldHandleHelp(childArguments)).toBe(false);
        expect(childArguments).toEqual({
            args: { help: false, json: false, command: 'create' },
            rest: [help, 'argument'],
        });
    }
    expect(command.parseArguments(['create', '--', '--help', '-x'])).toEqual({
        args: { help: false, json: false, command: 'create' },
        rest: ['--', '--help', '-x'],
    });
    expect(command.parseArguments(['--', 'create', '--help'])).toEqual({
        args: { help: false, json: false, command: 'create' },
        rest: ['--help'],
    });
    expect(command.getUsage()).toContain('cr idea [--help] [--json] [<command>]');
});

Deno.test('Idea accepts no subcommand and rejects unknown commands and invalid options', () => {
    const command = new Idea();
    for (const args of [[], ['--']]) {
        expect(command.getSubcommand(command.parseArguments(args))).toBeUndefined();
    }
    for (const args of [['unknown'], ['--', '--help'], ['map']]) {
        try {
            command.getSubcommand(command.parseArguments(args));
            throw new Error('Expected a usage error.');
        } catch (error) {
            expect(error).toBeInstanceOf(UsageError);
            expect((error as UsageError).usage()).toBe(command.getUsage());
            expect((error as Error).message).toBe(
                `Unknown idea subcommand "${args.at(-1)}".`,
            );
        }
    }
    for (const option of ['--unknown', '-x', '--help=value', '--json=value']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
});

for (
    const [name, Child] of [
        ['create', Create],
        ['split', Split],
        ['ready', Ready],
        ['reforge', Reforge],
    ] as const
) {
    Deno.test(`Idea dispatches ${name} and scopes help to the requested command`, () => {
        const root = Commands.cr();
        const globalArguments = root.parseArguments(['idea', name, '--help']);
        const idea = root.getSubcommand(globalArguments);
        if (!(idea instanceof Idea)) {
            throw new Error('Expected the Idea command.');
        }
        const parentArguments = idea.parseArguments(globalArguments.rest);
        expect(idea.shouldHandleHelp(parentArguments)).toBe(false);
        const child = idea.getSubcommand(parentArguments);
        expect(child).toBeInstanceOf(Child);
        if (child === undefined) throw new Error('Expected an idea subcommand.');
        const childArguments = child.parseArguments(parentArguments.rest);
        expect(child.shouldHandleHelp(childArguments)).toBe(true);
        expect(child.getUsage()).toContain(`cr idea ${name} [--help]`);
        expect(child.getSubcommand(childArguments)).toBeUndefined();
    });
}

Deno.test('Idea parses JSON output and preserves options for subcommands', () => {
    const command = new Idea();
    expect(command.parseArguments(['--json'])).toEqual({
        args: { help: false, json: true },
        rest: ['--json'],
    });
    expect(command.parseArguments(['--json', 'create', 'Title'])).toEqual({
        args: { help: false, json: true, command: 'create' },
        rest: ['--json', 'Title'],
    });
    expect(command.parseArguments(['--json', '--', 'ready', 'idea'])).toEqual({
        args: { help: false, json: true, command: 'ready' },
        rest: ['--json', 'idea'],
    });
    expect(command.parseArguments(['--json', '--help'])).toEqual({
        args: { help: true, json: true },
        rest: ['--json'],
    });
});

Deno.test('Idea renders nested text and JSON trees', async () => {
    const root = await Deno.makeTempDir();
    const plans = join(root, '.coderail', 'plans');
    const originalOutput = Log.output;
    const originalNoColor = Log.noColor;
    const output: unknown[][] = [];
    Log.output = (...messages): void => {
        output.push(messages);
    };
    Log.noColor = true;
    try {
        for (
            const [path, status] of [
                ['parent', 'split'],
                ['parent/child', 'ready'],
                ['last', 'forging'],
                ['last/child', 'ready'],
            ] as const
        ) {
            const directory = join(plans, path);
            await Deno.mkdir(directory, { recursive: true });
            await Deno.writeTextFile(
                join(directory, 'IDEA.md'),
                `---\ntitle: Display title\nstatus: ${status}\n---\nBody`,
            );
        }
        await Deno.writeTextFile(join(plans, 'parent', 'SPEC.md'), 'Specification');
        const command = new Idea();
        await runStub(command, root);
        expect(output).toEqual([[[
            '├── Display title ◌ forging [IDEA.md]',
            `│   ${join(plans, 'last')}`,
            '│   └── Display title ● ready [IDEA.md]',
            `│       ${join(plans, 'last', 'child')}`,
            '└── Display title ◉ split [IDEA.md, SPEC.md]',
            `    ${join(plans, 'parent')}`,
            '    └── Display title ● ready [IDEA.md]',
            `        ${join(plans, 'parent', 'child')}`,
        ].join('\n')]]);
        await command.run({
            context: { currentWorkingDirectory: root, installRoot: '/install' },
            configuration: { logLevel: 'normal', noColor: true, nonInteractive: false, verify: [] },
            parsedArguments: command.parseArguments(['--json']),
            signal: new AbortController().signal,
        });
        expect(JSON.parse(output[1]?.[0] as string)).toEqual([
            {
                path: join(plans, 'last'),
                id: 'last',
                title: 'Display title',
                status: 'forging',
                parent: null,
                files: ['IDEA.md'],
            },
            {
                path: join(plans, 'last', 'child'),
                id: 'last/child',
                title: 'Display title',
                status: 'ready',
                parent: 'last',
                files: ['IDEA.md'],
            },
            {
                path: join(plans, 'parent'),
                id: 'parent',
                title: 'Display title',
                status: 'split',
                parent: null,
                files: ['IDEA.md', 'SPEC.md'],
            },
            {
                path: join(plans, 'parent', 'child'),
                id: 'parent/child',
                title: 'Display title',
                status: 'ready',
                parent: 'parent',
                files: ['IDEA.md'],
            },
        ]);
    } finally {
        Log.output = originalOutput;
        Log.noColor = originalNoColor;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Idea reports tree failures with their original cause', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.writeTextFile(join(root, '.coderail'), 'Not a directory');
        try {
            await runStub(new Idea(), root);
            throw new Error('Expected tree construction to fail.');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Cannot build idea tree');
            expect((error as Error).cause).toBeInstanceOf(Error);
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
