import { Path } from '@path';
import { join } from '@std/path';

import { areDependenciesSatisfied } from './are-dependencies-satisfied.ts';
import { resolveTicket, type Ticket, TICKET_STATUS } from './resolve-ticket.ts';

/** Shared numeric selection with the ticket dependency semantics. */
export async function getReadyTickets(cwd: string, limit?: number): Promise<Ticket[]> {
    const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR, 'open');
    const ids: string[] = [];
    try {
        for await (const entry of Deno.readDir(directory)) {
            if (!entry.isFile) {
                continue;
            }
            const match = /^(\d{4,})-.+\.md$/.exec(entry.name);
            const id = match?.[1];
            if (id !== undefined) {
                ids.push(id);
            }
        }
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
    ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const tickets: Ticket[] = [];
    for (const id of ids) {
        const ticket = await resolveTicket(cwd, id);
        if (ticket.status !== TICKET_STATUS.OPEN) {
            continue;
        }
        let satisfied = true;
        for (const dependency of ticket.dependencies) {
            if (!(await areDependenciesSatisfied(cwd, dependency))) {
                satisfied = false;
                break;
            }
        }
        if (!satisfied) {
            continue;
        }
        tickets.push(ticket);
        if (tickets.length === limit) {
            break;
        }
    }
    return tickets;
}
