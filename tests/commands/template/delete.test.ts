import { Log } from '@log';
import { expect } from '@std/expect';

import { Delete } from '../../../src/commands/template/delete.ts';
import { Templates } from '../../../src/templates.ts';

Deno.test('template delete parses confirmation, help and output options', () => {
    const command = new Delete();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('--yes');
    expect(command.shouldHandleHelp(command.parseArguments(['--help']))).toBe(true);
    expect(command.shouldHandleHelp(command.parseArguments(['name']))).toBe(false);
    for (const flag of ['--yes', '-y']) {
        expect(command.parseArguments([flag, 'name']).args.yes).toBe(true);
    }
    for (const args of [
        [],
        ['--no', 'name'],
        ['--force', 'name'],
        ['--yes=true', 'name'],
        ['--json', '--path', 'name'],
        ['one', 'two'],
    ]) {
        expect(() => command.parseArguments(args)).toThrow();
    }
});
Deno.test(
    'template deletion confirms before removing, declines silently, and supports automatic output',
    async () => {
        const root = await Deno.makeTempDir();
        const savedOutput = Log.output;
        const savedConfirm = Log.confirm;
        const savedTerminal = Deno.stdin.isTerminal;
        const output: string[] = [];
        const signal = new AbortController().signal;
        const command = new Delete();
        const savedConsole = console.log;
        console.log = (...messages): void => {
            output.push(String(messages[0]));
        };
        Log.output = (...messages) => {
            output.push(String(messages[0]));
        };
        const run = (args: string[], nonInteractive = false): Promise<void> =>
            command.run({
                context: { installRoot: root, currentWorkingDirectory: '/unused' },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive,
                    verify: { rules: [] },
                },
                parsedArguments: command.parseArguments(args),
                signal,
            });
        try {
            const info = await Templates.create(root, 'name', '', signal);
            Deno.stdin.isTerminal = () => false;
            await expect(run(['name'])).rejects.toThrow('--yes');
            Deno.stdin.isTerminal = () => true;
            await expect(run(['name'], true)).rejects.toThrow('--yes');
            for (const flag of ['--json', '--path']) {
                Log.confirm = (message) => {
                    expect(message).toContain(info.path);
                    return false;
                };
                await run([flag, 'name']);
                expect(output).toEqual([]);
                expect(await Templates.get(root, 'name', signal)).toEqual(info);
            }
            Log.confirm = () => true;
            await run(['--json', 'name']);
            expect(JSON.parse(output.pop() as string)).toEqual([info]);
            await expect(Templates.get(root, 'name', signal)).rejects.toThrow();
            Log.confirm = () => {
                throw new Error('Unexpected prompt');
            };
            for (const flag of ['--json', '--path', '']) {
                await Templates.create(root, 'name', '', signal);
                await run(['--yes', 'name', ...(flag ? [flag] : [])], true);
                const result = output.pop();
                if (flag === '--json') {
                    expect(JSON.parse(result as string)).toEqual([info]);
                } else if (flag === '--path') {
                    expect(result).toBe(info.path);
                } else {
                    expect(result).toBe(`name  \n  ${info.path}`);
                }
            }
            await expect(run(['--yes', 'missing'])).rejects.toThrow();
        } finally {
            Log.output = savedOutput;
            console.log = savedConsole;
            Log.confirm = savedConfirm;
            Deno.stdin.isTerminal = savedTerminal;
            await Deno.remove(root, { recursive: true });
        }
    },
);
