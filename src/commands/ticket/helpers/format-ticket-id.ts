export function formatTicketId(id: number): string {
    return String(id).padStart(4, '0');
}
