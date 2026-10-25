import { expect } from '@std/expect';
import { join } from '@std/path';
import { Md } from '@md';
import { Fs } from '@fs';
import { Log } from '@log';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Create } from '../../../src/commands/idea/create.ts';

Deno.test('Idea create requires initialization and supports help', () => {
    const command = new Create();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr idea create');
    expect(command.getUsage()).toContain('--parent <parent_idea>');
    for (const args of [['-h', '--unknown'], ['--help'], ['New idea', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['New idea']))).toBe(false);
});

Deno.test('Idea create parses a title and optional parent path', () => {
    const command = new Create();
    expect(command.parseArguments(['New idea'])).toEqual({
        args: { help: false, ideaTitle: 'New idea', parent: undefined, json: false },
        rest: [],
    });
    for (
        const args of [
            ['-p', 'ideas/parent', 'New idea'],
            ['New idea', '--parent', 'ideas/parent'],
            ['--parent=ideas/parent', 'New idea'],
            ['--parent', 'ideas/parent', '--', 'New idea'],
        ]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ideaTitle: 'New idea', parent: 'ideas/parent', json: false },
            rest: [],
        });
    }
    expect(command.parseArguments(['--', '--help'])).toEqual({
        args: { help: false, ideaTitle: '--help', parent: undefined, json: false },
        rest: [],
    });
    expect(command.parseArguments(['New idea', '--'])).toEqual({
        args: { help: false, ideaTitle: 'New idea', parent: undefined, json: false },
        rest: [],
    });
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push('New idea');
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(['New idea']));
});

Deno.test('Idea create parses JSON output before or after the title and parent', () => {
    const command = new Create();
    for (const args of [['--json', 'New idea'], ['New idea', '--json']]) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ideaTitle: 'New idea', parent: undefined, json: true },
            rest: [],
        });
    }
    expect(command.parseArguments(['--json', '-p', 'parent', '--', 'New idea'])).toEqual({
        args: { help: false, ideaTitle: 'New idea', parent: 'parent', json: true },
        rest: [],
    });
    expect(command.parseArguments(['--', '--json'])).toEqual({
        args: { help: false, ideaTitle: '--json', parent: undefined, json: false },
        rest: [],
    });
});

Deno.test('Idea create rejects invalid options, titles, and extra arguments with usage', () => {
    const command = new Create();
    for (
        const args of [
            [],
            [''],
            ['   '],
            ['--'],
            ['one', 'two'],
            ['one', '--', 'two'],
            ['--', 'one', 'two'],
            ['-p'],
            ['--parent'],
            ['--parent='],
            ['--parent', '--help'],
            ['--parent', 'idea'],
            ['--json'],
            ['--json=true', 'New idea'],
            ['New idea', '--json='],
            ['-x'],
            ['--help=value'],
            ['.'],
            ['..'],
            ['!!!'],
            ['../outside'],
            ['/absolute'],
            ['nested/title'],
            ['nested\\title'],
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

async function withWorkspace(run: (cwd: string, plans: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd, join(cwd, '.coderail', 'plans'));
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function create(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Create();
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

async function expectIdea(directory: string, title: string): Promise<void> {
    const markdown = await Md.parse(await Fs.read(join(directory, 'IDEA.md'), { text: true }));
    expect(markdown.frontmatter).toEqual({ title, status: 'forging' });
    let content = '';
    for await (const chunk of markdown.content) content += chunk;
    expect(content.trim()).toBe('');
    const files = [];
    for await (const entry of Deno.readDir(directory)) files.push(entry.name);
    expect(files).toEqual(['IDEA.md']);
}

async function writeIdea(directory: string, title: string, status: string): Promise<void> {
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(
        join(directory, 'IDEA.md'),
        `---\ntitle: ${JSON.stringify(title)}\nstatus: ${status}\n---\nParent content\n`,
    );
}

async function expectFailure(
    operation: Promise<unknown>,
    title: string,
    cause: string,
): Promise<void> {
    try {
        await operation;
        throw new Error('Expected creation to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(`Cannot create idea "${title}"`);
        expect((error as Error).cause).toBeInstanceOf(Error);
        expect(((error as Error).cause as Error).message).toContain(cause);
    }
}

Deno.test('Idea create writes a forging idea in the supplied working directory', async () => {
    await withWorkspace(async (cwd, plans) => {
        const title = 'Příliš : "New idea"';
        expect(await create(cwd, [title])).toEqual([[[
            `└── ${title} ◌ forging [IDEA.md]`,
            `    ${join(plans, 'prilis-new-idea')}`,
        ].join('\n')]]);
        await expectIdea(join(plans, 'prilis-new-idea'), title);
    });
});

Deno.test('Idea create outputs a root artifact as JSON', async () => {
    await withWorkspace(async (cwd, plans) => {
        const output = await create(cwd, ['New idea', '--json']);
        expect(output).toHaveLength(1);
        expect(output[0]).toHaveLength(1);
        expect(JSON.parse(output[0]?.[0] as string)).toEqual([{
            path: join(plans, 'new-idea'),
            id: 'new-idea',
            title: 'New idea',
            status: 'forging',
            parent: null,
            files: ['IDEA.md'],
        }]);
        await expectIdea(join(plans, 'new-idea'), 'New idea');
    });
});

Deno.test('Idea create resolves split parents by path, ID, slug, and title', async () => {
    await withWorkspace(async (cwd, plans) => {
        const parent = join(plans, 'root', 'parent');
        await writeIdea(join(plans, 'root'), 'Root', 'split');
        await writeIdea(parent, 'Parent idea', 'split');
        const original = await Deno.readTextFile(join(parent, 'IDEA.md'));
        const references = [
            parent,
            '.coderail/plans/root/parent/IDEA.md',
            'root/parent',
            'parent',
            'Parent idea',
        ];
        for (const [index, reference] of references.entries()) {
            const output = await create(cwd, ['--json', '--parent', reference, `Child ${index}`]);
            expect(output).toHaveLength(1);
            expect(output[0]).toHaveLength(1);
            expect(JSON.parse(output[0]?.[0] as string)).toEqual([{
                path: join(parent, `child-${index}`),
                id: `root/parent/child-${index}`,
                title: `Child ${index}`,
                status: 'forging',
                parent: 'root/parent',
                files: ['IDEA.md'],
            }]);
            await expectIdea(join(parent, `child-${index}`), `Child ${index}`);
        }
        expect(await Deno.readTextFile(join(parent, 'IDEA.md'))).toBe(original);
    });
});

Deno.test('Idea create rejects existing directories and files without overwriting them', async () => {
    await withWorkspace(async (cwd, plans) => {
        await create(cwd, ['New idea']);
        const ideaPath = join(plans, 'new-idea');
        const original = await Deno.readTextFile(join(ideaPath, 'IDEA.md'));
        await expectFailure(create(cwd, ['New idea']), 'New idea', 'already exists');
        expect(await Deno.readTextFile(join(ideaPath, 'IDEA.md'))).toBe(original);
        await Deno.writeTextFile(join(plans, 'occupied'), 'Keep me');
        await expectFailure(create(cwd, ['Occupied']), 'Occupied', 'already exists');
        expect(await Deno.readTextFile(join(plans, 'occupied'))).toBe('Keep me');
    });
});

Deno.test('Idea create rejects missing and unsplit parents', async () => {
    await withWorkspace(async (cwd, plans) => {
        await expectFailure(
            create(cwd, ['--parent', 'missing', 'Child']),
            'Child',
            'Idea not found: missing',
        );
        for (const status of ['forging', 'ready']) {
            const parent = join(plans, status);
            await writeIdea(parent, status, status);
            await expectFailure(
                create(cwd, ['--parent', status, 'Child']),
                'Child',
                `Parent idea "${status}" is not split.`,
            );
            expect(await Fs.exists(join(parent, 'child'))).toBe(false);
        }
        expect(await Fs.exists(join(plans, 'child'))).toBe(false);
    });
});

Deno.test('Idea create preserves the cause of filesystem failures', async () => {
    await withWorkspace(async (cwd) => {
        await Deno.writeTextFile(join(cwd, '.coderail'), 'Blocked');
        await expectFailure(create(cwd, ['New idea']), 'New idea', 'Not a directory');
    });
});
