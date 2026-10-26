import { Path } from '@path';
import { join } from '@std/path';

export async function getLastTicketId(cwd: string): Promise<number | null> {
    const ticketsDirectory = join(cwd, Path.CODERAIL_DIR, 'tickets');
    let lastId: number | null = null;
    for (const status of ['open', 'active', 'closed']) {
        try {
            for await (const entry of Deno.readDir(join(ticketsDirectory, status))) {
                if (!entry.isFile) continue;
                const match = /^(\d{4,})-.+\.md$/.exec(entry.name);
                const id = match?.[1];
                if (id === undefined) continue;
                lastId = Math.max(lastId ?? 0, Number.parseInt(id, 10));
            }
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
    }
    return lastId;
}
