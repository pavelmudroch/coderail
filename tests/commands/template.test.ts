import { Log } from '@log';
import { expect } from '@std/expect';

import { Template } from '../../src/commands/template.ts';
import { Create } from '../../src/commands/template/create.ts';
import { Delete } from '../../src/commands/template/delete.ts';
import { Templates } from '../../src/templates.ts';

Deno.test('template routes subcommands, help and literal names', () => {
    const command = new Template();
    expect(command.requiresInit).toBe(false);
    expect(command.getUsage()).toContain('cr template');
    expect(command.shouldHandleHelp(command.parseArguments(['--help']))).toBe(true);
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const [name, type] of [
        ['create', Create],
        ['delete', Delete],
    ] as const) {
        const parsed = command.parseArguments([name, '--help']);
        expect(parsed.rest).toEqual(['--help']);
        expect(command.getSubcommand(parsed)).toBeInstanceOf(type);
        const literal = command.parseArguments(['--', name]);
        expect(literal.args.name).toBe(name);
        expect(command.getSubcommand(literal)).toBeUndefined();
    }
    for (const args of [
        ['--json', '--path'],
        ['a', 'b'],
        ['--unknown'],
        ['--json', 'create'],
        ['--path', 'delete'],
    ]) {
        expect(() => command.parseArguments(args)).toThrow();
    }
});
Deno.test('template lists and inspects with consistent output modes', async () => {
    const root = await Deno.makeTempDir();
    const output: string[] = [];
    const saved = Log.output;
    const savedConsole = console.log;
    console.log = (...messages): void => {
        output.push(String(messages[0]));
    };
    Log.output = (...messages) => {
        output.push(String(messages[0]));
    };
    const signal = new AbortController().signal;
    const command = new Template();
    const run = (args: string[]): Promise<void> =>
        command.run({
            context: {
                installRoot: root,
                currentWorkingDirectory: '/unused',
                resourceRoot: '/unused/assets',
            },
            configuration: {
                logLevel: 'normal',
                noColor: true,
                nonInteractive: true,
                verify: { rules: [] },
            },
            parsedArguments: command.parseArguments(args),
            signal,
        });
    try {
        await run(['--json']);
        expect(output.pop()).toBe('[]');
        const info = await Templates.create(root, 'create', 'Example', signal);
        await run(['--json']);
        expect(JSON.parse(output.pop() as string)).toEqual([info]);
        await run(['--json', '--', 'create']);
        expect(JSON.parse(output.pop() as string)).toEqual([info]);
        await run(['--path']);
        expect(output.pop()).toBe(info.path);
        await run(['--path', '--', 'create']);
        expect(output.pop()).toBe(info.path);
        await run([]);
        expect(output.pop()).toBe(`create  Example\n  ${info.path}`);
        await expect(run(['missing'])).rejects.toThrow('missing');
    } finally {
        Log.output = saved;
        console.log = savedConsole;
        await Deno.remove(root, { recursive: true });
    }
});
