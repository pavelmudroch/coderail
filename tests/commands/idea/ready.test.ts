import { expect } from '@std/expect';
import { join } from '@std/path';
import { Log } from '@log';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Ready } from '../../../src/commands/idea/ready.ts';

Deno.test('Idea ready requires initialization and supports help', () => {
    const command = new Ready();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr idea ready');
    for (const args of [['-h', '--unknown'], ['--help'], ['idea', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['idea']))).toBe(false);
});

Deno.test('Idea ready parses one reference and optional JSON output', () => {
    const command = new Ready();
    expect(command.parseArguments(['ideas/example'])).toEqual({
        args: { help: false, ideaReference: 'ideas/example', json: false },
        rest: [],
    });
    for (const args of [['--json', 'idea'], ['idea', '--json']]) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ideaReference: 'idea', json: true },
            rest: [],
        });
    }
    for (const reference of ['--help', '--json']) {
        expect(command.parseArguments(['--', reference])).toEqual({
            args: { help: false, ideaReference: reference, json: false },
            rest: [],
        });
    }
    expect(command.parseArguments(['idea', '--'])).toEqual(command.parseArguments(['idea']));
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push('idea');
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(['idea']));
});

Deno.test('Idea ready rejects invalid arguments with usage', () => {
    const command = new Ready();
    for (
        const args of [
            [],
            [''],
            ['   '],
            ['--'],
            ['one', 'two'],
            ['one', '--', 'two'],
            ['--', 'one', 'two'],
            ['--json'],
            ['--parent', 'idea'],
            ['--unknown'],
            ['-x'],
            ['--help=value'],
            ['--json=true', 'idea'],
        ]
    ) {
        try {
            command.parseArguments(args);
            throw new Error('Expected a usage error.');
        } catch (error) {
            expect(error).toBeInstanceOf(UsageError);
            expect((error as UsageError).usage()).toBe(command.getUsage());
        }
    }
});

async function ready(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Ready();
    const originalOutput = Log.output;
    const originalNoColor = Log.noColor;
    const output: unknown[][] = [];
    Log.output = (...messages): void => {
        output.push(messages);
    };
    Log.noColor = true;
    try {
        await command.run({
            context: { currentWorkingDirectory: cwd, installRoot: '/install' },
            configuration: {
                logLevel: 'normal',
                noColor: false,
                nonInteractive: false,
                verify: [],
            },
            parsedArguments: command.parseArguments(args),
            signal: new AbortController().signal,
        });
        return output;
    } finally {
        Log.output = originalOutput;
        Log.noColor = originalNoColor;
    }
}

Deno.test('Idea ready resolves references and preserves content, metadata, and other files', async () => {
    const cwd = await Deno.makeTempDir();
    const parent = join(cwd, '.coderail', 'plans', 'parent');
    const directory = join(parent, 'example');
    const filePath = join(directory, 'IDEA.md');
    try {
        await Deno.mkdir(directory, { recursive: true });
        const parentContent = '---\ntitle: Parent\nstatus: split\n---\nParent content\n';
        await Deno.writeTextFile(join(parent, 'IDEA.md'), parentContent);
        await Deno.writeTextFile(join(directory, 'SPEC.md'), 'Keep specification');
        const references = [
            directory,
            '.coderail/plans/parent/example/IDEA.md',
            'parent/example',
            'example',
            'Example idea',
        ];
        for (const [index, reference] of references.entries()) {
            await Deno.writeTextFile(
                filePath,
                '---\ntitle: Example idea\nstatus: forging\ncustom: keep\n---\n# Content\n\nKeep me\n',
            );
            const output = await ready(cwd, index === 0 ? [reference] : ['--json', reference]);
            if (index === 0) {
                expect(output).toEqual([[[
                    '└── Example idea ● ready [IDEA.md, SPEC.md]',
                    `    ${directory}`,
                ].join('\n')]]);
            } else {
                expect(JSON.parse(output[0]?.[0] as string)).toEqual([{
                    path: directory,
                    id: 'parent/example',
                    title: 'Example idea',
                    status: 'ready',
                    parent: 'parent',
                    files: ['IDEA.md', 'SPEC.md'],
                }]);
            }
            expect(await Deno.readTextFile(filePath)).toBe(
                '---\ntitle: "Example idea"\nstatus: "ready"\ncustom: "keep"\n---\n# Content\n\nKeep me\n',
            );
            expect(await Deno.readTextFile(join(directory, 'SPEC.md'))).toBe('Keep specification');
            expect(await Deno.readTextFile(join(parent, 'IDEA.md'))).toBe(parentContent);
        }
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});

Deno.test('Idea ready rejects non-forging and missing ideas without changing files', async () => {
    const cwd = await Deno.makeTempDir();
    const directory = join(cwd, '.coderail', 'plans', 'example');
    const filePath = join(directory, 'IDEA.md');
    try {
        await Deno.mkdir(directory, { recursive: true });
        for (const status of ['ready', 'split']) {
            const original = `---\ntitle: Example\nstatus: ${status}\n---\nKeep me\n`;
            await Deno.writeTextFile(filePath, original);
            try {
                await ready(cwd, ['example']);
                throw new Error('Expected status transition to fail.');
            } catch (error) {
                expect((error as Error).message).toBe('Cannot mark idea "example" as ready');
                expect(((error as Error).cause as Error).message).toBe(
                    'Idea "example" is not forging.',
                );
            }
            expect(await Deno.readTextFile(filePath)).toBe(original);
        }
        try {
            await ready(cwd, ['missing']);
            throw new Error('Expected resolution to fail.');
        } catch (error) {
            expect((error as Error).message).toBe('Cannot mark idea "missing" as ready');
            expect(((error as Error).cause as Error).message).toBe('Idea not found: missing');
        }
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});
