import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '@fs';
import { Log } from '@log';
import { type Frontmatter, Md } from '@md';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Next } from '../../../src/commands/ticket/next.ts';

Deno.test('Ticket next parses help, JSON output, and positive integer limits', () => {
    const command = new Next();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.getUsage()).toContain('cr ticket next');
    expect(command.parseArguments([])).toEqual({ args: { help: false, json: false }, rest: [] });
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const args of [['-h', '--unknown'], ['--help'], ['--json', '--help']]) {
        expect(command.shouldHandleHelp(command.parseArguments(args))).toBe(true);
    }
    for (
        const args of [['-l', '2', '--json'], ['--json', '--limit', '2'], [
            '--limit=2',
            '--json',
            '--',
        ]]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, json: true, limit: 2 },
            rest: [],
        });
    }
    expect(command.parseArguments(['--limit=1']).args.limit).toBe(1);
    expect(command.parseArguments(['--limit=9007199254740991']).args.limit).toBe(
        Number.MAX_SAFE_INTEGER,
    );
    const sparseArgs: string[] = [];
    sparseArgs.length = 1;
    expect(command.parseArguments(sparseArgs)).toEqual(command.parseArguments([]));
});

Deno.test('Ticket next rejects invalid limits, unknown options, and positional arguments', () => {
    const command = new Next();
    for (
        const value of [
            '0',
            '-1',
            '1.5',
            'NaN',
            'Infinity',
            '1e2',
            '+1',
            ' 2',
            '2 ',
            '9007199254740992',
            'abc',
        ]
    ) {
        expect(() => command.parseArguments(['--limit', value])).toThrow(UsageError);
        expect(() => command.parseArguments([`--limit=${value}`])).toThrow(UsageError);
    }
    for (
        const args of [
            ['-l'],
            ['--limit'],
            ['--limit='],
            ['--limit', '--json'],
            ['--help=value'],
            ['--json=true'],
            ['-x'],
            ['0001'],
            ['--', '--help'],
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

async function writeTicket(tickets: string, id: string, frontmatter: Frontmatter): Promise<string> {
    const directory = join(tickets, String(frontmatter.status));
    await Deno.mkdir(directory, { recursive: true });
    const path = join(directory, `${id}-ticket.md`);
    await Fs.write(
        path,
        Md.toStream(Md.create('Preserve content\n', { title: 'Ticket', ...frontmatter })),
    );
    return path;
}

async function next(cwd: string, args: string[] = []): Promise<unknown[][]> {
    const command = new Next();
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

async function jsonTickets(
    cwd: string,
    args: string[] = [],
): Promise<{ id: string; path: string }[]> {
    const output = await next(cwd, ['--json', ...args]);
    expect(output).toHaveLength(1);
    expect(output[0]).toHaveLength(1);
    return JSON.parse(output[0]?.[0] as string);
}

Deno.test('Ticket next returns no tickets for missing, empty, or ineligible open directories', async () => {
    await withWorkspace(async (cwd, tickets) => {
        expect(await next(cwd)).toEqual([]);
        expect(await jsonTickets(cwd)).toEqual([]);
        await Deno.mkdir(join(tickets, 'open'), { recursive: true });
        await Deno.mkdir(join(tickets, 'open', '0001-directory.md'));
        await Deno.writeTextFile(join(tickets, 'open', 'notes.md'), 'Ignored');
        await writeTicket(tickets, '0002', { status: 'active' });
        await writeTicket(tickets, '0003', { status: 'closed', reason: 'done' });
        const misplaced = await writeTicket(tickets, '0004', { status: 'active' });
        await Deno.rename(misplaced, join(tickets, 'open', '0004-ticket.md'));
        expect(await next(cwd)).toEqual([]);
        expect(await jsonTickets(cwd)).toEqual([]);
    });
});

Deno.test('Ticket next filters all dependencies and follows duplicate chains', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await writeTicket(tickets, '0001', { status: 'closed', reason: 'done' });
        await writeTicket(tickets, '0002', { status: 'closed', reason: 'dismissed' });
        await writeTicket(tickets, '0003', { status: 'active' });
        await writeTicket(tickets, '0004', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0001',
        });
        await writeTicket(tickets, '0005', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0004',
        });
        await writeTicket(tickets, '0006', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0002',
        });
        await writeTicket(tickets, '0007', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0008',
        });
        await writeTicket(tickets, '0008', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0007',
        });
        const cases: [string, Frontmatter, boolean][] = [
            ['0010', {}, true],
            ['0011', { dependencies: [] }, true],
            ['0012', { dependencies: ['0001', '0005'] }, true],
            ['0013', { dependencies: ['0001', '0002'] }, false],
            ['0014', { dependencies: ['0003'] }, false],
            ['0015', { dependencies: ['0010'] }, false],
            ['0016', { dependencies: ['0006'] }, false],
            ['0017', { dependencies: ['0007'] }, false],
        ];
        for (const [id, frontmatter] of cases) {
            await writeTicket(tickets, id, { status: 'open', ...frontmatter });
        }
        const before = await Deno.readTextFile(join(tickets, 'open', '0012-ticket.md'));
        const result = await jsonTickets(cwd);
        expect(result.map((ticket) => ticket.id)).toEqual(['0010', '0011', '0012']);
        expect(result[2]).toEqual({
            path: join(tickets, 'open', '0012-ticket.md'),
            id: '0012',
            slug: 'ticket',
            title: 'Ticket',
            status: 'open',
            dependencies: ['0001', '0005'],
        });
        expect(await Deno.readTextFile(join(tickets, 'open', '0012-ticket.md'))).toBe(before);
    });
});

Deno.test('Ticket next limits eligible tickets in numeric ID order', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await writeTicket(tickets, '10000', { status: 'open' });
        await writeTicket(tickets, '9999', { status: 'open' });
        await writeTicket(tickets, '0001', { status: 'open', dependencies: ['0002'] });
        await writeTicket(tickets, '0002', { status: 'active' });
        await writeTicket(tickets, '0003', { status: 'open' });
        for (
            const [limit, expected] of [
                ['1', ['0003']],
                ['2', ['0003', '9999']],
                ['10', ['0003', '9999', '10000']],
            ] as const
        ) {
            expect((await jsonTickets(cwd, ['--limit', limit])).map((ticket) => ticket.id)).toEqual(
                expected,
            );
        }
        expect(await next(cwd, ['-l', '2'])).toEqual([[
            [
                join('.coderail', 'tickets', 'open', '0003-ticket.md'),
                join('.coderail', 'tickets', 'open', '9999-ticket.md'),
            ].join('\n'),
        ]]);
        await Deno.writeTextFile(join(tickets, 'open', '10000-ticket.md'), 'Invalid metadata');
        expect((await jsonTickets(cwd, ['-l', '1'])).map((ticket) => ticket.id)).toEqual(['0003']);
    });
});

async function expectFailure(operation: Promise<unknown>, cause: string): Promise<void> {
    try {
        await operation;
        throw new Error('Expected next to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Cannot get next tickets');
        expect(((error as Error).cause as Error).message).toContain(cause);
    }
}

Deno.test('Ticket next reports directory, metadata, and dependency errors', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await Deno.mkdir(tickets, { recursive: true });
        await Deno.writeTextFile(join(tickets, 'open'), 'Preserve');
        await expectFailure(next(cwd), 'Not a directory');
        await Deno.remove(join(tickets, 'open'));
        const source = await writeTicket(tickets, '0001', {
            status: 'open',
            dependencies: ['0002'],
        });
        await expectFailure(next(cwd), 'Ticket not found: 0002');
        await writeTicket(tickets, '0001', { status: 'open', dependencies: false });
        await expectFailure(next(cwd), 'Invalid ticket dependencies');
        await Deno.writeTextFile(source, '---\ntitle: [\n---\n');
        await expectFailure(next(cwd), 'Unfinished array');
    });
});
