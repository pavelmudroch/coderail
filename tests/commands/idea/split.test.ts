import { expect } from '@std/expect';
import { join } from '@std/path';
import { Log } from '@log';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Split } from '../../../src/commands/idea/split.ts';

Deno.test('Idea split requires initialization and supports help', () => {
    const command = new Split();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr idea split');
    for (const args of [['-h', '--unknown'], ['--help'], ['idea', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['idea', 'First', 'Second']))).toBe(
        false,
    );
});

Deno.test('Idea split parses an idea reference, child titles, and JSON output', () => {
    const command = new Split();
    for (const childTitles of [['First', 'Second'], ['First', 'Second', 'Third']]) {
        expect(command.parseArguments(['ideas/parent', ...childTitles])).toEqual({
            args: { help: false, ideaReference: 'ideas/parent', childTitles, json: false },
            rest: [],
        });
    }
    for (
        const args of [
            ['--json', 'idea', 'First', 'Second'],
            ['idea', '--json', 'First', 'Second'],
            ['idea', 'First', 'Second', '--json'],
        ]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: {
                help: false,
                ideaReference: 'idea',
                childTitles: ['First', 'Second'],
                json: true,
            },
            rest: [],
        });
    }
    expect(command.parseArguments(['ideas/parent', '--', '--help', '-x'])).toEqual({
        args: {
            help: false,
            ideaReference: 'ideas/parent',
            childTitles: ['--help', '-x'],
            json: false,
        },
        rest: [],
    });
    expect(command.parseArguments(['--', '--json', 'First', 'Second'])).toEqual({
        args: {
            help: false,
            ideaReference: '--json',
            childTitles: ['First', 'Second'],
            json: false,
        },
        rest: [],
    });
    const args = ['idea', 'First', 'Second'];
    expect(command.parseArguments([...args, '--'])).toEqual(command.parseArguments(args));
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push(...args);
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(args));
});

Deno.test('Idea split rejects invalid arguments and colliding child slugs with usage', () => {
    const command = new Split();
    for (
        const args of [
            [],
            ['idea'],
            ['idea', 'First'],
            ['--json'],
            ['--parent', 'idea'],
            ['--unknown'],
            ['-x'],
            ['--help=value'],
            ['--json=true', 'idea', 'First', 'Second'],
            ['--'],
            [' ', 'First', 'Second'],
            ...[
                '',
                ' ',
                '.',
                '..',
                '!!!',
                '../outside',
                '/absolute',
                'nested/title',
                'nested\\title',
            ]
                .map((title) => ['idea', 'First', title]),
            ['idea', 'First', 'First'],
            ['idea', 'First child', 'first-child'],
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

async function split(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Split();
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

Deno.test('Idea split resolves references, creates forging children, and preserves existing files', async () => {
    const cwd = await Deno.makeTempDir();
    const root = join(cwd, '.coderail', 'plans', 'root');
    try {
        await Deno.mkdir(root, { recursive: true });
        const rootContent = '---\ntitle: Root\nstatus: split\n---\nRoot content\n';
        await Deno.writeTextFile(join(root, 'IDEA.md'), rootContent);
        const references = [
            (directory: string): string => directory,
            (): string => '.coderail/plans/root/parent-1/IDEA.md',
            (): string => 'root/parent-2',
            (): string => 'parent-3',
            (): string => 'Parent 4',
        ];
        for (const [index, reference] of references.entries()) {
            const directory = join(root, `parent-${index}`);
            await Deno.mkdir(directory);
            await Deno.writeTextFile(
                join(directory, 'IDEA.md'),
                `---\ntitle: Parent ${index}\nstatus: ${
                    index === 0 ? 'ready' : 'forging'
                }\ncustom: keep\n---\n# Content\n\nKeep me\n`,
            );
            await Deno.writeTextFile(join(directory, 'SPEC.md'), 'Keep specification');
            const titles = ['Zebra', 'Příliš : "New idea"'];
            const output = await split(cwd, [
                reference(directory),
                ...titles,
                ...(index === 0 ? [] : ['--json']),
            ]);
            if (index === 0) {
                expect(output).toEqual([[[
                    '└── Parent 0 ◉ split [IDEA.md, SPEC.md]',
                    `    ${directory}`,
                    '    ├── Příliš : "New idea" ◌ forging [IDEA.md]',
                    `    │   ${join(directory, 'prilis-new-idea')}`,
                    '    └── Zebra ◌ forging [IDEA.md]',
                    `        ${join(directory, 'zebra')}`,
                ].join('\n')]]);
            } else {
                expect(JSON.parse(output[0]?.[0] as string)).toEqual([
                    {
                        path: directory,
                        id: `root/parent-${index}`,
                        title: `Parent ${index}`,
                        status: 'split',
                        parent: 'root',
                        files: ['IDEA.md', 'SPEC.md'],
                    },
                    ...[['prilis-new-idea', titles[1]], ['zebra', titles[0]]].map((
                        [slug, title],
                    ) => ({
                        path: join(directory, slug as string),
                        id: `root/parent-${index}/${slug}`,
                        title,
                        status: 'forging',
                        parent: `root/parent-${index}`,
                        files: ['IDEA.md'],
                    })),
                ]);
            }
            expect(await Deno.readTextFile(join(directory, 'IDEA.md'))).toBe(
                `---\ntitle: "Parent ${index}"\nstatus: "split"\ncustom: "keep"\n---\n# Content\n\nKeep me\n`,
            );
            for (const [slug, title] of [['zebra', titles[0]], ['prilis-new-idea', titles[1]]]) {
                expect(await Deno.readTextFile(join(directory, slug as string, 'IDEA.md'))).toBe(
                    `---\ntitle: ${JSON.stringify(title)}\nstatus: "forging"\n---\n`,
                );
            }
            expect(await Deno.readTextFile(join(directory, 'SPEC.md'))).toBe('Keep specification');
            expect(await Deno.readTextFile(join(root, 'IDEA.md'))).toBe(rootContent);
        }
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});

Deno.test('Idea split rejects missing, split, and occupied ideas before changing files', async () => {
    const cwd = await Deno.makeTempDir();
    const directory = join(cwd, '.coderail', 'plans', 'example');
    const filePath = join(directory, 'IDEA.md');
    try {
        await Deno.mkdir(directory, { recursive: true });
        for (
            const [reference, status, occupied, cause] of [
                ['missing', 'forging', false, 'Idea not found: missing'],
                ['example', 'split', false, 'Idea "example" is already split.'],
                ['example', 'ready', true, 'already exists'],
            ] as const
        ) {
            const original = `---\ntitle: Example\nstatus: ${status}\n---\nKeep me\n`;
            await Deno.writeTextFile(filePath, original);
            if (occupied) await Deno.writeTextFile(join(directory, 'second'), 'Keep me');
            try {
                await split(cwd, [reference, 'First', 'Second']);
                throw new Error('Expected split to fail.');
            } catch (error) {
                expect((error as Error).message).toBe(`Cannot split idea "${reference}"`);
                expect(((error as Error).cause as Error).message).toContain(cause);
            }
            expect(await Deno.readTextFile(filePath)).toBe(original);
            expect(Array.from(Deno.readDirSync(directory), (entry) => entry.name).sort()).toEqual(
                occupied ? ['IDEA.md', 'second'] : ['IDEA.md'],
            );
            if (occupied) {
                expect(await Deno.readTextFile(join(directory, 'second'))).toBe('Keep me');
            }
        }
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});
