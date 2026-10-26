import { resolveTicket } from './resolve-ticket.ts';

export function areDependenciesSatisfied(cwd: string, id: string): Promise<boolean> {
    const visited = new Set<string>();
    async function isSatisfied(id: string): Promise<boolean> {
        if (visited.has(id)) return false;
        visited.add(id);
        const ticket = await resolveTicket(cwd, id);
        if (ticket.status !== 'closed') return false;
        if (ticket.reason === 'done') return true;
        if (ticket.reason === 'duplicate') return isSatisfied(ticket['duplicate-of']);
        return false;
    }
    return isSatisfied(id);
}
