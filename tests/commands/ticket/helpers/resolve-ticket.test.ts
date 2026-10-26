import { expect } from '@std/expect';
import { join, relative } from '@std/path';
import { Fs } from '@fs';
import { Md } from '@md';
import type { Frontmatter } from '@md';
import { resolveTicket } from '../../../../src/commands/ticket/helpers/resolve-ticket.ts';

async function withWorkspace(run: (cwd: string, tickets: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd, join(cwd, '.coderail', 'tickets'));
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function writeTicket(
    tickets: string,
    status: string,
    frontmatter: Frontmatter,
): Promise<string> {
    const directory = join(tickets, status);
    await Deno.mkdir(directory, { recursive: true });
    const path = join(directory, '0001-new-ticket.md');
    await Fs.write(path, Md.toStream(Md.create('Ticket content\n', { status, ...frontmatter })));
    return path;
}

Deno.test('resolveTicket finds tickets in every status and returns their metadata', async () => {
    for (const status of ['open', 'active', 'closed']) {
        await withWorkspace(async (cwd, tickets) => {
            const path = await writeTicket(tickets, status, {
                title: 'New ticket',
                dependencies: ['0002', '0003', '10000'],
                ...(status === 'closed' ? { reason: 'done' } : {}),
            });
            await Deno.mkdir(join(tickets, status, '0001-directory.md'));
            await Deno.writeTextFile(join(tickets, status, 'notes.md'), '');
            await Deno.writeTextFile(join(tickets, status, '0002-other.md'), '');
            expect(await resolveTicket(relative(Deno.cwd(), cwd), '0001')).toEqual({
                path,
                id: '0001',
                slug: 'new-ticket',
                title: 'New ticket',
                dependencies: ['0002', '0003', '10000'],
                status,
                ...(status === 'closed' ? { reason: 'done' } : {}),
            });
            expect(await Deno.readTextFile(path)).toContain('Ticket content');
        });
    }
});

Deno.test('resolveTicket returns closure reasons and duplicate references', async () => {
    await withWorkspace(async (cwd, tickets) => {
        for (const reason of ['done', 'dismissed', 'duplicate']) {
            const frontmatter: Frontmatter = { title: 'New ticket', reason };
            if (reason === 'duplicate') frontmatter['duplicate-of'] = '10000';
            const path = await writeTicket(tickets, 'closed', frontmatter);
            expect(await resolveTicket(cwd, '0001')).toEqual({
                path,
                id: '0001',
                slug: 'new-ticket',
                title: 'New ticket',
                dependencies: [],
                status: 'closed',
                reason,
                ...(reason === 'duplicate' ? { 'duplicate-of': '10000' } : {}),
            });
        }
    });
});

Deno.test('resolveTicket rejects invalid statuses, closure reasons, and duplicate references', async () => {
    await withWorkspace(async (cwd, tickets) => {
        for (const status of ['', 'unknown', 1]) {
            const path = await writeTicket(tickets, 'open', { title: 'New ticket', status });
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid ticket status: ${path}`,
            );
        }
        await Deno.remove(join(tickets, 'open'), { recursive: true });
        const reasons: Frontmatter[] = [{}, { reason: 'deferred' }, { reason: 1 }];
        for (const frontmatter of reasons) {
            const path = await writeTicket(tickets, 'closed', {
                title: 'New ticket',
                ...frontmatter,
            });
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid ticket closure reason: ${path}`,
            );
        }
        const duplicates: Frontmatter[] = [{}, { 'duplicate-of': '' }, { 'duplicate-of': 2 }, {
            'duplicate-of': 'invalid',
        }];
        for (const frontmatter of duplicates) {
            const path = await writeTicket(tickets, 'closed', {
                title: 'New ticket',
                reason: 'duplicate',
                ...frontmatter,
            });
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid duplicate-of ticket ID: ${path}`,
            );
        }
    });
});

Deno.test('resolveTicket returns an empty dependency array for empty or absent dependencies', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const examples: Frontmatter[] = [{ title: 'New ticket', dependencies: [] }, {
            title: 'New ticket',
        }];
        for (const frontmatter of examples) {
            await writeTicket(tickets, 'open', frontmatter);
            expect((await resolveTicket(cwd, '0001')).dependencies).toEqual([]);
        }
        await Deno.rename(
            join(tickets, 'open', '0001-new-ticket.md'),
            join(tickets, 'open', '10000-new-ticket.md'),
        );
        expect((await resolveTicket(cwd, '10000')).id).toBe('10000');
    });
});

Deno.test('resolveTicket rejects missing and ambiguous IDs', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await expect(resolveTicket(cwd, '0001')).rejects.toThrow('Ticket not found: 0001');
        await writeTicket(tickets, 'open', { title: 'New ticket' });
        await expect(resolveTicket(cwd, '0002')).rejects.toThrow('Ticket not found: 0002');
        await writeTicket(tickets, 'closed', { title: 'Duplicate ticket' });
        await expect(resolveTicket(cwd, '0001')).rejects.toThrow('Ambiguous ticket ID: 0001');
    });
});

Deno.test('resolveTicket rejects invalid title and dependency front matter', async () => {
    await withWorkspace(async (cwd, tickets) => {
        const examples: Frontmatter[] = [{}, { title: 1 }, { title: '' }, { title: '   ' }];
        for (const frontmatter of examples) {
            const path = await writeTicket(tickets, 'open', frontmatter);
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid ticket title: ${path}`,
            );
        }
        for (const dependencies of [1, false, '0002']) {
            const path = await writeTicket(tickets, 'open', { title: 'New ticket', dependencies });
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid ticket dependencies: ${path}`,
            );
        }
        for (const dependencies of [[1], [false], [''], [' '], ['1'], ['../0002']]) {
            const path = await writeTicket(tickets, 'open', { title: 'New ticket', dependencies });
            await expect(resolveTicket(cwd, '0001')).rejects.toThrow(
                `Invalid ticket dependency: ${path}`,
            );
        }
    });
});

Deno.test('resolveTicket propagates directory and markdown errors', async () => {
    await withWorkspace(async (cwd, tickets) => {
        await Deno.mkdir(tickets, { recursive: true });
        await Deno.writeTextFile(join(tickets, 'open'), '');
        await expect(resolveTicket(cwd, '0001')).rejects.toBeInstanceOf(Deno.errors.NotADirectory);
        await Deno.remove(join(tickets, 'open'));
        const path = await writeTicket(tickets, 'open', { title: 'New ticket' });
        await Deno.writeTextFile(path, '---\ntitle: [\n---\n');
        await expect(resolveTicket(cwd, '0001')).rejects.toBeInstanceOf(SyntaxError);
    });
});
