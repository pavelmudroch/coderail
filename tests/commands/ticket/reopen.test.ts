import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Reopen } from '../../../src/commands/ticket/reopen.ts';

Deno.test('Ticket reopen parses IDs, JSON output, and help', () => {
    const command = new Reopen();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr ticket reopen');
    for (const args of [['-h', '--unknown'], ['--help'], ['0001', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    expect(command.shouldHandleHelp(command.parseArguments(['0001']))).toBe(false);
    expect(command.parseArguments(['0001'])).toEqual({
        args: { help: false, ticketId: '0001', json: false, dependsOn: [] },
        rest: [],
    });
    for (
        const args of [['--json', '--', '10000'], ['10000', '--json'], ['--json', '10000', '--']]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ticketId: '10000', json: true, dependsOn: [] },
            rest: [],
        });
    }
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    sparseArgs.push('0001');
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments(['0001']));
});

Deno.test('Ticket reopen rejects missing, invalid, and extra arguments', () => {
    const command = new Reopen();
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

async function reopen(cwd: string, args: string[]): Promise<unknown[][]> {
    const command = new Reopen();
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

Deno.test('Ticket reopen moves active and closed tickets and preserves its content and metadata', async () => {
    for (const json of [false, true]) {
        await withWorkspace(async (cwd, tickets) => {
            const id = json ? '10000' : '0001';
            const source = await writeTicket(tickets, json ? 'closed' : 'active', id);
            const path = join(tickets, 'open', `${id}-new-ticket.md`);
            const output = await reopen(cwd, json ? ['--json', id] : [id]);
            expect(await Fs.exists(source)).toBe(false);
            const markdown = await Md.parse(await Fs.read(path, { text: true }));
            expect(markdown.frontmatter).toEqual({
                id,
                title: 'New ticket',
                status: 'open',
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
                        ? JSON.stringify([{ path, ...markdown.frontmatter }], null, 4)
                        : join('.coderail', 'tickets', 'open', `${id}-new-ticket.md`),
                ],
            ]);
        });
    }
});

async function expectFailure(operation: Promise<unknown>, cause: string): Promise<void> {
    try {
        await operation;
        throw new Error('Expected reopening to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Cannot reopen ticket "0001"');
        expect(((error as Error).cause as Error).message).toContain(cause);
    }
}

Deno.test('Ticket reopen rejects missing and ambiguous tickets', async () => {
    await withWorkspace(async (cwd) => {
        await expectFailure(reopen(cwd, ['0001']), 'Ticket not found: 0001');
    });
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'closed');
        const target = await writeTicket(tickets, 'open');
        const original = await Deno.readTextFile(target);
        await expectFailure(reopen(cwd, ['0001']), 'Ambiguous ticket ID');
        expect(await Fs.exists(source)).toBe(true);
        expect(await Deno.readTextFile(target)).toBe(original);
    });
});

Deno.test('Ticket reopen preserves the source when the destination exists or cannot be written', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'closed');
        const original = await Deno.readTextFile(source);
        const target = join(tickets, 'open', '0001-new-ticket.md');
        await Deno.mkdir(target, { recursive: true });
        await expectFailure(reopen(cwd, ['0001']), 'already exists');
        expect(await Deno.readTextFile(source)).toBe(original);
        await Deno.remove(target);
        await Deno.writeTextFile(join(tickets, 'open', '.~0001-new-ticket.md.lock'), 'Locked');
        await expectFailure(reopen(cwd, ['0001']), 'File exists');
        expect(await Deno.readTextFile(source)).toBe(original);
        expect(await Fs.exists(target)).toBe(false);
    });
});

Deno.test('Ticket reopen parses repeated dependencies and rejects invalid ones', () => {
    const command = new Reopen();
    expect(command.parseArguments(['0001', '-d', '0002', '--depends-on=0003', '-d', '0002']).args)
        .toEqual({ help: false, ticketId: '0001', json: false, dependsOn: ['0002', '0003'] });
    for (
        const args of [
            ['0001', '-d'],
            ['0001', '--depends-on='],
            ['0001', '-d', '--json'],
            ['0001', '-d', '1'],
            ['0001', '-d', '../0002'],
            ['0001', '-d', '0001'],
        ]
    ) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});

Deno.test('Ticket reopen removes closure fields from every status', async () => {
    for (const status of ['open', 'active', 'closed']) {
        for (const reason of ['done', 'dismissed', 'duplicate']) {
            await withWorkspace(async (cwd, tickets) => {
                const source = await writeTicket(tickets, status);
                const markdown = await Md.parse(await Fs.read(source, { text: true }));
                markdown.frontmatter.reason = reason;
                markdown.frontmatter['duplicate-of'] = '0002';
                await Fs.write(source, Md.toStream(markdown));
                await reopen(cwd, ['0001']);
                const reopened = await Md.parse(
                    await Fs.read(join(tickets, 'open', '0001-new-ticket.md'), { text: true }),
                );
                await reopened.content.cancel();
                expect(reopened.frontmatter.status).toBe('open');
                expect(Object.hasOwn(reopened.frontmatter, 'reason')).toBe(false);
                expect(Object.hasOwn(reopened.frontmatter, 'duplicate-of')).toBe(false);
            });
        }
    }
});

Deno.test('Ticket reopen leaves an already open ticket unchanged', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'open');
        const original = await Deno.readTextFile(source);
        await reopen(cwd, ['0001']);
        expect(await Deno.readTextFile(source)).toBe(original);
        await writeTicket(tickets, 'closed', '0002');
        await reopen(cwd, ['0001', '-d', '0002']);
        expect(await Deno.readTextFile(source)).toBe(original);
        const markdown = await Md.parse(await Fs.read(source, { text: true }));
        markdown.frontmatter['duplicate-of'] = '0002';
        await Fs.write(source, Md.toStream(markdown));
        await reopen(cwd, ['0001']);
        const reopened = await Md.parse(await Fs.read(source, { text: true }));
        await reopened.content.cancel();
        expect(Object.hasOwn(reopened.frontmatter, 'duplicate-of')).toBe(false);
    });
});

Deno.test('Ticket reopen merges dependencies and validates them before writing', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const source = await writeTicket(tickets, 'open');
        const original = await Deno.readTextFile(source);
        await expectFailure(reopen(cwd, ['0001', '-d', '0003']), 'Ticket not found: 0003');
        expect(await Deno.readTextFile(source)).toBe(original);
        await writeTicket(tickets, 'closed', '0002');
        await writeTicket(tickets, 'active', '0003');
        await reopen(cwd, ['0001', '-d', '0002', '-d', '0003']);
        const markdown = await Md.parse(await Fs.read(source, { text: true }));
        await markdown.content.cancel();
        expect(markdown.frontmatter.dependencies).toEqual(['0002', '0003']);
        expect(markdown.frontmatter.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
        for (const dependencies of [undefined, [], '0002', 1]) {
            const ticket = await Md.parse(await Fs.read(source, { text: true }));
            if (dependencies === undefined) delete ticket.frontmatter.dependencies;
            else ticket.frontmatter.dependencies = dependencies;
            await Fs.write(source, Md.toStream(ticket));
            if (typeof dependencies === 'string' || dependencies === 1) {
                await expectFailure(
                    reopen(cwd, ['0001', '-d', '0002']),
                    'Invalid ticket dependencies',
                );
            } else {
                await reopen(cwd, ['0001', '-d', '0002']);
                const reopened = await Md.parse(await Fs.read(source, { text: true }));
                await reopened.content.cancel();
                expect(reopened.frontmatter.dependencies).toEqual(['0002']);
            }
        }
    });
});
