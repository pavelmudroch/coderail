import type { Ticket } from './resolve-ticket.ts';
import { Log } from '@log';

export function formatText(tickets: Ticket[]): string {
    const lines: string[] = [];
    for (const ticket of tickets) {
        const id = Log.color.yellow(ticket.id);
        const title = Log.color.cyan(ticket.title);
        const path = Log.color.gray(ticket.path);
        lines.push(`${id} ${title} ${path}`);
    }
    return lines.join('\n');
}

export function formatJson(tickets: Ticket[]): string {
    return JSON.stringify(tickets, null, 2);
}
