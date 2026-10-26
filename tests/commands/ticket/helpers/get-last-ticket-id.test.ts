import { expect } from '@std/expect';
import { join } from '@std/path';
import { getLastTicketId } from '../../../../src/commands/ticket/helpers/get-last-ticket-id.ts';

Deno.test('getLastTicketId returns null when ticket directories are missing or empty', async () => {
    const cwd = await Deno.makeTempDir();
    try {
        expect(await getLastTicketId(cwd)).toBeNull();
        for (const status of ['open', 'active', 'closed']) {
            await Deno.mkdir(join(cwd, '.coderail', 'tickets', status), { recursive: true });
        }
        expect(await getLastTicketId(cwd)).toBeNull();
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});

Deno.test('getLastTicketId returns the numeric maximum from each status directory', async () => {
    const cwd = await Deno.makeTempDir();
    try {
        const tickets = join(cwd, '.coderail', 'tickets');
        for (
            const [status, ids] of [
                ['open', ['0010', '0002']],
                ['active', ['9999', '0005']],
                ['closed', ['10000', '0009']],
            ] as const
        ) {
            const directory = join(tickets, status);
            await Deno.mkdir(directory, { recursive: true });
            for (const id of ids) {
                await Deno.writeTextFile(join(directory, `${id}-ticket.md`), '');
            }
            expect(await getLastTicketId(cwd)).toBe(Number(ids[0]));
        }
        await Deno.mkdir(join(tickets, 'open', '99999-directory.md'));
        for (const name of ['notes.md', '99999-ticket.txt', '99999-.md', '123-ticket.md']) {
            await Deno.writeTextFile(join(tickets, 'open', name), '');
        }
        await Deno.mkdir(join(tickets, 'other'));
        await Deno.writeTextFile(join(tickets, 'other', '99999-ticket.md'), '');
        expect(await getLastTicketId(cwd)).toBe(10000);
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});

Deno.test('getLastTicketId propagates errors other than missing directories', async () => {
    const cwd = await Deno.makeTempDir();
    try {
        const tickets = join(cwd, '.coderail', 'tickets');
        await Deno.mkdir(tickets, { recursive: true });
        await Deno.writeTextFile(join(tickets, 'open'), '');
        await expect(getLastTicketId(cwd)).rejects.toBeInstanceOf(Deno.errors.NotADirectory);
    } finally {
        await Deno.remove(cwd, { recursive: true });
    }
});
