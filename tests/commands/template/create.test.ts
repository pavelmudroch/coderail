import { Log } from '@log';
import { expect } from '@std/expect';

import { Create } from '../../../src/commands/template/create.ts';
import { Templates } from '../../../src/templates.ts';

Deno.test('template create parses descriptions and rejects invalid arguments', () => {
    const command = new Create();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('Config-format metadata');
    for (const help of ['--help', '-h']) {
        expect(command.shouldHandleHelp(command.parseArguments([help]))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['name']))).toBe(false);
    for (const option of ['--description', '-d']) {
        expect(command.parseArguments(['name', option, 'text']).args.description).toBe('text');
    }
    expect(command.parseArguments(['--description=', 'name']).args.description).toBe('');
    expect(command.parseArguments(['--description=text', 'name']).args.description).toBe('text');
    expect(command.parseArguments(['--', '--literal']).args.name).toBe('--literal');
    const sparse = new Array<string>(1);
    sparse.push('name');
    expect(command.parseArguments(sparse).args.name).toBe('name');
    for (const args of [
        [],
        [''],
        [' '],
        ['--'],
        ['--description'],
        ['a', 'b'],
        ['a', '--', 'b'],
        ['--json', '--path', 'a'],
        ['--yes', 'a'],
        ['--help=x'],
        ['--json=x'],
        ['--path=x'],
    ]) {
        expect(() => command.parseArguments(args)).toThrow();
    }
});
Deno.test('template create emits JSON arrays, absolute paths and normal output', async () => {
    const root = await Deno.makeTempDir();
    const saved = Log.output;
    const output: string[] = [];
    const savedConsole = console.log;
    console.log = (...messages): void => {
        output.push(String(messages[0]));
    };
    Log.output = (...messages) => {
        output.push(String(messages[0]));
    };
    const signal = new AbortController().signal;
    const command = new Create();
    try {
        for (const [name, options] of [
            ['json', ['--json']],
            ['path', ['--path']],
            ['normal', []],
        ] as const) {
            await command.run({
                context: { installRoot: root, currentWorkingDirectory: '/unused' },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                parsedArguments: command.parseArguments([name, ...options, '-d', 'description']),
                signal,
            });
            const info = await Templates.get(root, name, signal);
            const result = output.pop();
            if (name === 'json') {
                expect(JSON.parse(result as string)).toEqual([info]);
            } else if (name === 'path') {
                expect(result).toBe(info.path);
            } else {
                expect(result).toBe(`normal  description\n  ${info.path}`);
            }
        }
    } finally {
        Log.output = saved;
        console.log = savedConsole;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('shared template options preserve routing and restrict operation flags', async () => {
    const { Template } = await import('../../../src/commands/template.ts');
    const { Delete } = await import('../../../src/commands/template/delete.ts');
    const parent = new Template();
    const deletion = new Delete();
    for (const flag of ['--yes', '-y']) {
        expect(deletion.parseArguments([flag, 'name']).args.yes).toBe(true);
    }
    for (const name of ['create', 'delete']) {
        expect(parent.parseArguments([name, 'name', '--json']).rest).toEqual(['name', '--json']);
        expect(parent.parseArguments(['--', name]).args.name).toBe(name);
        for (const flag of ['--json', '--path']) {
            expect(() => parent.parseArguments([flag, name])).toThrow();
        }
        expect(() => parent.parseArguments(['other', name])).toThrow();
    }
    expect(parent.parseArguments([]).args.name).toBeUndefined();
    expect(() => deletion.parseArguments(['--description', 'text'])).toThrow();
});
