import { Fs } from '@fs';
import { Md } from '@md';
import { Path } from '@path';
import { join } from '@std/path';
import { resolveTicket, TICKET_STATUS } from '@tickets';

export type TicketStatus = 'open' | 'active' | 'closed';
export type ClosedReason = 'done' | 'dismissed' | 'duplicate';

type OpenOrActiveTicketListItem = {
    id: string;
    title: string;
    status: Exclude<TicketStatus, 'closed'>;
    path: string;
    createdAt: string;
    updatedAt: string;
    dependsOn: string[];
};

interface ClosedNotDuplicateTicketListItem extends Omit<OpenOrActiveTicketListItem, 'status'> {
    status: 'closed';
    reason: Exclude<ClosedReason, 'duplicate'>;
}
interface ClosedDuplicateTicketListItem extends Omit<OpenOrActiveTicketListItem, 'status'> {
    status: 'closed';
    reason: 'duplicate';
    duplicateOf: string;
}

export type TicketListItem =
    OpenOrActiveTicketListItem | ClosedNotDuplicateTicketListItem | ClosedDuplicateTicketListItem;

export async function getTicketList(cwd: string = Deno.cwd()): Promise<TicketListItem[]> {
    const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR);
    const ids: string[] = [];
    for (const status of Object.values(TICKET_STATUS)) {
        try {
            for await (const entry of Deno.readDir(join(directory, status))) {
                if (!entry.isFile) {
                    continue;
                }
                const id = /^(\d{4,})-.+\.md$/.exec(entry.name)?.[1];
                if (id !== undefined) {
                    ids.push(id);
                }
            }
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
        }
    }
    ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const tickets: TicketListItem[] = [];
    for (const id of ids) {
        const ticket = await resolveTicket(cwd, id);
        const markdown = await Md.parse(await Fs.read(ticket.path, { text: true }));
        await markdown.content.cancel();
        const { created_at: createdAt, updated_at: updatedAt } = markdown.frontmatter;
        if (typeof createdAt !== 'string' || createdAt.trim() === '') {
            throw new Error(`Invalid ticket created_at: ${ticket.path}`);
        }
        if (typeof updatedAt !== 'string' || updatedAt.trim() === '') {
            throw new Error(`Invalid ticket updated_at: ${ticket.path}`);
        }
        const item = {
            id: ticket.id,
            title: ticket.title,
            path: ticket.path,
            createdAt,
            updatedAt,
            dependsOn: ticket.dependencies,
        };
        if (ticket.status !== 'closed') {
            tickets.push({ ...item, status: ticket.status });
        } else if (ticket.reason === 'duplicate') {
            tickets.push({
                ...item,
                status: ticket.status,
                reason: ticket.reason,
                duplicateOf: ticket['duplicate-of'],
            });
        } else {
            tickets.push({ ...item, status: ticket.status, reason: ticket.reason });
        }
    }
    return tickets;
}
