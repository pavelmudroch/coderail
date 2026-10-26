import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '@fs';
import { Md } from '@md';
import type { Frontmatter } from '@md';
import { areDependenciesSatisfied } from '../../../../src/commands/ticket/helpers/are-dependencies-satisfied.ts';

async function withWorkspace(run: (cwd: string) => Promise<void>): Promise<void> {
    const cwd = await Deno.makeTempDir();
    try {
        await run(cwd);
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
}

async function writeTicket(cwd: string, id: string, frontmatter: Frontmatter): Promise<void> {
    const directory = join(cwd, '.coderail', 'tickets', String(frontmatter.status));
    await Deno.mkdir(directory, { recursive: true });
    await Fs.write(
        join(directory, `${id}-ticket.md`),
        Md.toStream(Md.create('', { title: 'Ticket', ...frontmatter })),
    );
}

Deno.test('areDependenciesSatisfied accepts only tickets closed as done', async () => {
    await withWorkspace(async (cwd) => {
        const tickets: [string, Frontmatter, boolean][] = [
            ['0001', { status: 'open' }, false],
            ['0002', { status: 'active' }, false],
            ['0003', { status: 'closed', reason: 'dismissed' }, false],
            ['0004', { status: 'closed', reason: 'done' }, true],
        ];
        for (const [id, frontmatter, expected] of tickets) {
            await writeTicket(cwd, id, frontmatter);
            expect(await areDependenciesSatisfied(cwd, id)).toBe(expected);
        }
    });
});

Deno.test('areDependenciesSatisfied follows duplicate chains to their final status', async () => {
    await withWorkspace(async (cwd) => {
        await writeTicket(cwd, '0001', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0002',
        });
        await writeTicket(cwd, '0002', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0003',
        });
        for (const reason of ['dismissed', 'done']) {
            await writeTicket(cwd, '0003', { status: 'closed', reason });
            expect(await areDependenciesSatisfied(cwd, '0001')).toBe(reason === 'done');
        }
        await Deno.remove(join(cwd, '.coderail', 'tickets', 'closed', '0003-ticket.md'));
        await writeTicket(cwd, '0003', { status: 'open' });
        expect(await areDependenciesSatisfied(cwd, '0001')).toBe(false);
    });
});

Deno.test('areDependenciesSatisfied rejects self references and duplicate cycles', async () => {
    await withWorkspace(async (cwd) => {
        await writeTicket(cwd, '0001', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0001',
        });
        expect(await areDependenciesSatisfied(cwd, '0001')).toBe(false);
        await writeTicket(cwd, '0001', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0002',
        });
        await writeTicket(cwd, '0002', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0001',
        });
        expect(await areDependenciesSatisfied(cwd, '0001')).toBe(false);
    });
});

Deno.test('areDependenciesSatisfied propagates missing ticket and invalid metadata errors', async () => {
    await withWorkspace(async (cwd) => {
        await expect(areDependenciesSatisfied(cwd, '0001')).rejects.toThrow(
            'Ticket not found: 0001',
        );
        await writeTicket(cwd, '0001', {
            status: 'closed',
            reason: 'duplicate',
            'duplicate-of': '0002',
        });
        await expect(areDependenciesSatisfied(cwd, '0001')).rejects.toThrow(
            'Ticket not found: 0002',
        );
        await writeTicket(cwd, '0002', { status: 'closed', reason: 'unknown' });
        await expect(areDependenciesSatisfied(cwd, '0001')).rejects.toThrow(
            'Invalid ticket closure reason',
        );
    });
});
