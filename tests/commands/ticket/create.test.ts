import { expect } from '@std/expect';
import { Create } from '../../../src/commands/ticket/create.ts';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { join } from '@std/path';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';

Deno.test('Ticket create requires initialization and supports help', () => {
    const command = new Create();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr ticket create');
    for (const args of [['-h', '--unknown'], ['--help'], ['New ticket', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['New ticket']))).toBe(false);
});

async function withWorkspace(run: (cwd: string, tickets: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd, join(cwd, '.coderail', 'tickets'));
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function create(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Create();
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

async function writeTicket(tickets: string, status: string, name: string): Promise<void> {
    await Deno.mkdir(join(tickets, status), { recursive: true });
    await Fs.write(
        join(tickets, status, name),
        Md.toStream(Md.create('Existing ticket\n', {
            title: 'Existing ticket',
            status,
            dependencies: [],
            ...(status === 'closed' ? { reason: 'done' } : {}),
        })),
    );
}

async function expectFailure(operation: Promise<unknown>, cause: string): Promise<void> {
    try {
        await operation;
        throw new Error('Expected creation to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Cannot create ticket "New ticket"');
        expect((error as Error).cause).toBeInstanceOf(Error);
        expect(((error as Error).cause as Error).message).toContain(cause);
    }
}

Deno.test('Ticket create writes an open ticket and prints its relative path', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const title = 'Příliš : "New ticket"';
        const path = join(tickets, 'open', '0001-prilis-new-ticket.md');
        expect(await create(cwd, [title])).toEqual([
            [join('.coderail', 'tickets', 'open', '0001-prilis-new-ticket.md')],
        ]);
        const markdown = await Md.parse(await Fs.read(path, { text: true }));
        const timestamp = markdown.frontmatter.created_at;
        expect(typeof timestamp).toBe('string');
        expect(Number.isNaN(Date.parse(timestamp as string))).toBe(false);
        expect(markdown.frontmatter).toEqual({
            id: '0001',
            slug: 'prilis-new-ticket',
            title,
            status: 'open',
            created_at: timestamp,
            updated_at: timestamp,
            dependencies: [],
        });
        let content = '';
        for await (const chunk of markdown.content) content += chunk;
        expect(content.trim()).toBe('');
    });
});

Deno.test('Ticket create allocates IDs across statuses and preserves dependency tickets', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await writeTicket(tickets, 'open', '0002-first.md');
        await writeTicket(tickets, 'active', '0005-second.md');
        await writeTicket(tickets, 'closed', '0009-third.md');
        await writeTicket(tickets, 'open', 'notes.md');
        await Deno.mkdir(join(tickets, 'open', '9999-directory.md'));
        const existingTickets = [
            ['open', '0002-first.md'],
            ['active', '0005-second.md'],
            ['closed', '0009-third.md'],
        ];
        const originals = await Promise.all(
            existingTickets.map(([status, name]) =>
                Deno.readTextFile(join(tickets, status as string, name as string))
            ),
        );
        const output = await create(cwd, [
            '--json',
            'New ticket',
            '-d',
            '0002',
            '-d',
            '0005',
            '-d',
            '0009',
            '-d',
            '0002',
        ]);
        const path = join(tickets, 'open', '0010-new-ticket.md');
        const markdown = await Md.parse(await Fs.read(path, { text: true }));
        await markdown.content.cancel();
        expect(markdown.frontmatter.id).toBe('0010');
        expect(markdown.frontmatter.dependencies).toEqual(['0002', '0005', '0009']);
        expect(output).toHaveLength(1);
        expect(output[0]).toHaveLength(1);
        expect(JSON.parse(output[0]?.[0] as string)).toEqual([{ path, ...markdown.frontmatter }]);
        for (const [index, [status, name]] of existingTickets.entries()) {
            expect(await Deno.readTextFile(join(tickets, status as string, name as string))).toBe(
                originals[index],
            );
        }
    });
});

Deno.test('Ticket create supports IDs beyond four digits and repeated titles', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await writeTicket(tickets, 'closed', '9999-old.md');
        await create(cwd, ['New ticket']);
        await create(cwd, ['New ticket', '-d', '10000']);
        expect(await Fs.exists(join(tickets, 'open', '10000-new-ticket.md'))).toBe(true);
        const markdown = await Md.parse(
            await Fs.read(join(tickets, 'open', '10001-new-ticket.md'), { text: true }),
        );
        await markdown.content.cancel();
        expect(markdown.frontmatter.dependencies).toEqual(['10000']);
    });
});

Deno.test('Ticket create rejects missing and self dependencies before writing', async () => {
    await withWorkspace(async (cwd, tickets) => {
        for (const dependency of ['0001', '0002']) {
            await expectFailure(
                create(cwd, ['New ticket', '-d', dependency]),
                `Ticket not found: ${dependency}`,
            );
            expect(await Fs.exists(tickets)).toBe(false);
        }
    });
});

Deno.test('Ticket create reports unreadable status directories and unsafe IDs', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await Deno.mkdir(tickets, { recursive: true });
        await Deno.writeTextFile(join(tickets, 'open'), 'Preserve me');
        await expectFailure(create(cwd, ['New ticket']), 'Not a directory');
        expect(await Deno.readTextFile(join(tickets, 'open'))).toBe('Preserve me');
        await Deno.remove(join(tickets, 'open'));
        await writeTicket(tickets, 'closed', '9007199254740991-old.md');
        await expectFailure(create(cwd, ['New ticket']), 'Cannot allocate a safe ticket ID.');
        expect(await Fs.exists(join(tickets, 'open'))).toBe(false);
    });
});

Deno.test('Ticket create preserves an existing destination', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const originalExists = Fs.exists;
        Fs.exists = (path): Promise<boolean> => {
            expect(path).toBe(join(tickets, 'open', '0001-new-ticket.md'));
            return Promise.resolve(true);
        };
        try {
            await expectFailure(create(cwd, ['New ticket']), 'already exists.');
        } finally {
            Fs.exists = originalExists;
        }
        expect(await Fs.exists(tickets)).toBe(false);
    });
});

Deno.test('Ticket create parses a title, repeated dependencies, and JSON output', () => {
    const command = new Create();
    expect(command.parseArguments(['New ticket'])).toEqual({
        args: { help: false, ticketTitle: 'New ticket', dependsOn: [], json: false },
        rest: [],
    });
    for (
        const args of [
            ['-d', '0001', 'New ticket', '--depends-on', '0002', '--json', '-d', '0001'],
            ['--json', '--depends-on=0001', '--depends-on=0002', '--', 'New ticket'],
        ]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: {
                help: false,
                ticketTitle: 'New ticket',
                dependsOn: ['0001', '0002'],
                json: true,
            },
            rest: [],
        });
    }
    expect(command.parseArguments(['--', '--help']).args.ticketTitle).toBe('--help');
    expect(command.parseArguments(['New ticket', '--'])).toEqual(
        command.parseArguments(['New ticket']),
    );
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push('New ticket');
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(['New ticket']));
});

Deno.test('Ticket create rejects invalid arguments with usage', () => {
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
            ['-d'],
            ['--depends-on'],
            ['--depends-on='],
            ['--depends-on', '--help'],
            ['--depends-on', '0001'],
            ['-d', '../0001', 'New ticket'],
            ['-d', 'invalid', 'New ticket'],
            ['--json'],
            ['--json=true', 'New ticket'],
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
