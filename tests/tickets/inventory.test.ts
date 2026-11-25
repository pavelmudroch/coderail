import { expect } from '@std/expect';
import { dirname, join } from '@std/path';

import { readTicketInventory, ticketReferences } from '../../src/tickets/inventory.ts';
import '../commands/doctor/tickets.test.ts';

Deno.test(
    'ticket inventory exposes only exact authoritative paths and keeps reference kinds',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const closed = join(root, '.coderail', 'tickets', 'closed', '0001-ticket-0001.md');
            const misplaced = join(root, '.coderail', 'tickets', 'open', '0002-ticket-0002.md');
            for (const [id, path] of [
                ['0001', closed],
                ['0002', misplaced],
            ] as const) {
                await Deno.mkdir(dirname(path), { recursive: true });
                await Deno.writeTextFile(
                    path,
                    `---\nid: "${id}"\nslug: "ticket-${id}"\ntitle: "Ticket ${id}"\nstatus: "closed"\ncreated_at: "now"\nupdated_at: "now"\nreason: "duplicate"\nduplicate-of: "0003"\ndependencies: ["0004"]\n---\n`,
                );
            }
            const inventory = await readTicketInventory(root, new AbortController().signal);
            expect([...inventory.byPath.keys()]).toEqual([closed]);
            const item = inventory.byPath.get(closed);
            expect(item?.status).toBe('closed');
            if (item === undefined) {
                throw new Error('Missing authoritative ticket');
            }
            expect(ticketReferences(item)).toEqual([
                { kind: 'dependency', id: '0004' },
                { kind: 'duplicate-of', id: '0003' },
            ]);
            expect(inventory.findings.map(({ message }) => message)).toEqual([
                'Incorrect placement',
            ]);
            expect(inventory.target('0002')).toMatchObject({ path: misplaced, status: 'closed' });
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
