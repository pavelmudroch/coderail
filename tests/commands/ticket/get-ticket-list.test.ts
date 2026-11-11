import { Fs } from '@fs';
import { type Frontmatter, Md } from '@md';
import { expect } from '@std/expect';
import { join, relative } from '@std/path';

import { getTicketList } from '../../../src/commands/ticket/get-ticket-list.ts';

const createdAt = '2026-01-01T12:00:00Z';
const updatedAt = '2026-02-01T12:00:00Z';

async function withWorkspace(run: (cwd: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd);
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function writeTicket(
    cwd: string,
    id: string,
    status: string,
    frontmatter: Frontmatter = {},
): Promise<string> {
    const path = join(cwd, '.coderail', 'tickets', status, `${id}-ticket.md`);
    await Fs.makeDirectory(join(cwd, '.coderail', 'tickets', status));
    await Fs.write(
        path,
        Md.toStream(
            Md.create('Ticket content\n', {
                title: `Ticket ${id}`,
                status,
                created_at: createdAt,
                updated_at: updatedAt,
                ...frontmatter,
            }),
        ),
    );
    return path;
}

Deno.test(
    'getTicketList returns all statuses, closure metadata, and numeric ID order',
    async () => {
        await withWorkspace(async (cwd) => {
            const examples = [
                { id: '10000', status: 'open', frontmatter: { dependencies: ['0002', '0003'] } },
                { id: '0003', status: 'active', frontmatter: {} },
                { id: '0010', status: 'closed', frontmatter: { reason: 'done' } },
                { id: '0002', status: 'closed', frontmatter: { reason: 'dismissed' } },
                {
                    id: '0001',
                    status: 'closed',
                    frontmatter: { reason: 'duplicate', 'duplicate-of': '0010' },
                },
            ];
            for (const { id, status, frontmatter } of examples) {
                await writeTicket(cwd, id, status, frontmatter as Frontmatter);
            }
            const tickets = await getTicketList(relative(Deno.cwd(), cwd));
            expect(tickets.map((ticket) => ticket.id)).toEqual([
                '0001',
                '0002',
                '0003',
                '0010',
                '10000',
            ]);
            expect(tickets).toEqual(
                [
                    {
                        id: '0001',
                        title: 'Ticket 0001',
                        status: 'closed',
                        reason: 'duplicate',
                        duplicateOf: '0010',
                        dependsOn: [],
                    },
                    {
                        id: '0002',
                        title: 'Ticket 0002',
                        status: 'closed',
                        reason: 'dismissed',
                        dependsOn: [],
                    },
                    { id: '0003', title: 'Ticket 0003', status: 'active', dependsOn: [] },
                    {
                        id: '0010',
                        title: 'Ticket 0010',
                        status: 'closed',
                        reason: 'done',
                        dependsOn: [],
                    },
                    {
                        id: '10000',
                        title: 'Ticket 10000',
                        status: 'open',
                        dependsOn: ['0002', '0003'],
                    },
                ].map((ticket) => ({
                    ...ticket,
                    path: join(
                        cwd,
                        '.coderail',
                        'tickets',
                        ticket.status,
                        `${ticket.id}-ticket.md`,
                    ),
                    createdAt,
                    updatedAt,
                })),
            );
        });
    },
);

Deno.test('getTicketList tolerates missing directories and ignores unrelated entries', async () => {
    await withWorkspace(async (cwd) => {
        expect(await getTicketList(cwd)).toEqual([]);
        const path = await writeTicket(cwd, '0001', 'open');
        const directory = join(cwd, '.coderail', 'tickets', 'open');
        await Deno.mkdir(join(directory, '0002-directory.md'));
        for (const name of ['notes.md', '1-short.md', '0002-.md', '0002-ticket.txt']) {
            await Deno.writeTextFile(join(directory, name), '');
        }
        const tickets = await getTicketList(cwd);
        expect(tickets).toHaveLength(1);
        expect(tickets[0]?.path).toBe(path);
    });
});

Deno.test('getTicketList defaults to the current working directory', async () => {
    await withWorkspace(async (cwd) => {
        await writeTicket(cwd, '0001', 'open');
        const previousCwd = Deno.cwd();
        try {
            Deno.chdir(cwd);
            expect((await getTicketList()).map((ticket) => ticket.id)).toEqual(['0001']);
        } finally {
            Deno.chdir(previousCwd);
        }
    });
});

Deno.test('getTicketList rejects missing, non-string, and empty timestamps', async () => {
    await withWorkspace(async (cwd) => {
        for (const field of ['created_at', 'updated_at']) {
            for (const value of [1, false, [], '', '   ']) {
                const path = await writeTicket(cwd, '0001', 'open', { [field]: value });
                await expect(getTicketList(cwd)).rejects.toThrow(
                    `Invalid ticket ${field}: ${path}`,
                );
            }
            const path = await writeTicket(cwd, '0001', 'open');
            const markdown = await Md.parse(await Fs.read(path, { text: true }));
            await markdown.content.cancel();
            delete markdown.frontmatter[field];
            await Fs.write(path, Md.toStream(Md.create('', markdown.frontmatter)));
            await expect(getTicketList(cwd)).rejects.toThrow(`Invalid ticket ${field}: ${path}`);
        }
    });
});

Deno.test('getTicketList propagates directory, metadata, and ambiguous ID errors', async () => {
    await withWorkspace(async (cwd) => {
        const directory = join(cwd, '.coderail', 'tickets');
        await Fs.makeDirectory(directory);
        await Deno.writeTextFile(join(directory, 'open'), '');
        await expect(getTicketList(cwd)).rejects.toBeInstanceOf(Deno.errors.NotADirectory);
        await Deno.remove(join(directory, 'open'));
        const path = await writeTicket(cwd, '0001', 'open', { title: '' });
        await expect(getTicketList(cwd)).rejects.toThrow(`Invalid ticket title: ${path}`);
        await Deno.writeTextFile(path, '---\ntitle: [\n---\n');
        await expect(getTicketList(cwd)).rejects.toBeInstanceOf(SyntaxError);
        await writeTicket(cwd, '0001', 'active');
        await expect(getTicketList(cwd)).rejects.toThrow('Ambiguous ticket ID: 0001');
    });
});
