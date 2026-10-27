import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Activate } from '../../../src/commands/ticket/activate.ts';

Deno.test('Ticket activate parses IDs, JSON output, and help', () => {
    const command = new Activate();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr ticket activate');
    for (const args of [['-h', '--unknown'], ['--help'], ['0001', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['0001']))).toBe(false);
    expect(command.parseArguments(['0001'])).toEqual({
        args: { help: false, ticketId: '0001', json: false },
        rest: [],
    });
    for (
        const args of [['--json', '--', '10000'], ['10000', '--json'], ['--json', '10000', '--']]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ticketId: '10000', json: true },
            rest: [],
        });
    }
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push('0001');
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(['0001']));
});

Deno.test('Ticket activate rejects missing, invalid, and extra arguments', () => {
    const command = new Activate();
    for (
        const args of [
            [],
            [''],
            [' '],
            ['--'],
            ['--json'],
            ['1'],
            ['abcd'],
            ['../0001'],
            ['0001', '0002'],
            ['0001', '--', '0002'],
            ['--', '0001', '0002'],
            ['--help=value'],
            ['--json=true', '0001'],
            ['-x'],
        ]
    ) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});

async function withWorkspace(run: (cwd: string, tickets: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd, join(cwd, '.coderail', 'tickets'));
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function activate(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Activate();
    const originalOutput = Log.output;
    const output: unknown[][] = [];
    Log.output = (...messages): void => {
        output.push(messages);
    };
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
    }
}

async function writeTicket(tickets: string, status: string, id = '0001'): Promise<string> {
    const directory = join(tickets, status);
    await Deno.mkdir(directory, { recursive: true });
    const path = join(directory, `${id}-new-ticket.md`);
    await Fs.write(
        path,
        Md.toStream(Md.create('# Ticket\n\n- [ ] Task\n', {
            id,
            title: 'New ticket',
            status,
            dependencies: ['0002'],
            created_at: '2020-01-01T00:00:00.000Z',
            updated_at: '2020-01-01T00:00:00.000Z',
            custom: ['preserve', 'metadata'],
            ...(status === 'closed' ? { reason: 'done' } : {}),
        })),
    );
    return path;
}

Deno.test('Ticket activate moves an open ticket and preserves its content and metadata', async () => {
    for (const json of [false, true]) {
        await withWorkspace(async (cwd, tickets) => {
            const id = json ? '10000' : '0001';
            const source = await writeTicket(tickets, 'open', id);
            const path = join(tickets, 'active', `${id}-new-ticket.md`);
            const output = await activate(cwd, json ? ['--json', id] : [id]);
            expect(await Fs.exists(source)).toBe(false);
            const markdown = await Md.parse(await Fs.read(path, { text: true }));
            expect(markdown.frontmatter).toEqual({
                id,
                title: 'New ticket',
                status: 'active',
                dependencies: ['0002'],
                created_at: '2020-01-01T00:00:00.000Z',
                updated_at: markdown.frontmatter.updated_at,
                custom: ['preserve', 'metadata'],
            });
            expect(Number.isNaN(Date.parse(markdown.frontmatter.updated_at as string))).toBe(false);
            expect(markdown.frontmatter.updated_at).not.toBe(markdown.frontmatter.created_at);
            let content = '';
            for await (const chunk of markdown.content) content += chunk;
            expect(content).toBe('# Ticket\n\n- [ ] Task\n');
            expect(output).toEqual([
                [
                    json
                        ? JSON.stringify(
                            [{
                                path,
                                id,
                                slug: 'new-ticket',
                                title: 'New ticket',
                                dependencies: ['0002'],
                                status: 'active',
                            }],
                            null,
                            2,
                        )
                        : `${Log.color.yellow(id)} ${Log.color.cyan('New ticket')} ${
                            Log.color.gray(path)
                        }`,
                ],
            ]);
        });
    }
});

async function expectFailure(operation: Promise<unknown>, cause: string): Promise<void> {
    try {
        await operation;
        throw new Error('Expected activation to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Cannot activate ticket "0001"');
        expect(((error as Error).cause as Error).message).toContain(cause);
    }
}

Deno.test('Ticket activate rejects missing, active, closed, and ambiguous tickets', async () => {
    await withWorkspace(async (cwd) => {
        await expectFailure(activate(cwd, ['0001']), 'Ticket not found: 0001');
    });
    for (const status of ['active', 'closed']) {
        await withWorkspace(async (cwd, tickets) => {
            const path = await writeTicket(tickets, status);
            const original = await Deno.readTextFile(path);
            await expectFailure(activate(cwd, ['0001']), 'is not open');
            expect(await Deno.readTextFile(path)).toBe(original);
        });
    }
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'open');
        const target = await writeTicket(tickets, 'active');
        const original = await Deno.readTextFile(target);
        await expectFailure(activate(cwd, ['0001']), 'Ambiguous ticket ID');
        expect(await Fs.exists(source)).toBe(true);
        expect(await Deno.readTextFile(target)).toBe(original);
    });
});

Deno.test('Ticket activate preserves the source when the destination exists or cannot be written', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'open');
        const original = await Deno.readTextFile(source);
        const target = join(tickets, 'active', '0001-new-ticket.md');
        await Deno.mkdir(target, { recursive: true });
        await expectFailure(activate(cwd, ['0001']), 'already exists');
        expect(await Deno.readTextFile(source)).toBe(original);
        await Deno.remove(target);
        await Deno.writeTextFile(join(tickets, 'active', '.~0001-new-ticket.md.lock'), 'Locked');
        await expectFailure(activate(cwd, ['0001']), 'File exists');
        expect(await Deno.readTextFile(source)).toBe(original);
        expect(await Fs.exists(target)).toBe(false);
    });
});
