import { Fs } from '@fs';
import { Md } from '@md';
import { Path } from '@path';
import { join, resolve } from '@std/path';

export const TICKET_STATUS = {
    OPEN: 'open',
    ACTIVE: 'active',
    CLOSED: 'closed',
} as const;

export type Ticket =
    & {
        path: string;
        id: string;
        slug: string;
        title: string;
        dependencies: string[];
    }
    & (
        | { status: typeof TICKET_STATUS.OPEN | typeof TICKET_STATUS.ACTIVE }
        | { status: typeof TICKET_STATUS.CLOSED; reason: 'done' | 'dismissed' }
        | { status: typeof TICKET_STATUS.CLOSED; reason: 'duplicate'; 'duplicate-of': string }
    );

export async function resolveTicket(cwd: string, id: string): Promise<Ticket> {
    const ticketsDirectory = resolve(cwd, Path.CODERAIL_DIR, 'tickets');
    const matches: { path: string; slug: string }[] = [];
    for (const status of ['open', 'active', 'closed']) {
        try {
            for await (const entry of Deno.readDir(join(ticketsDirectory, status))) {
                if (!entry.isFile) continue;
                const match = /^(\d{4,})-(.+)\.md$/.exec(entry.name);
                const slug = match?.[2];
                if (match?.[1] !== id || slug === undefined) continue;
                matches.push({ path: join(ticketsDirectory, status, entry.name), slug });
            }
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
        }
    }
    if (matches.length > 1) {
        throw new Error(`Ambiguous ticket ID: ${id}`);
    }
    const match = matches[0];
    if (match === undefined) {
        throw new Error(`Ticket not found: ${id}`);
    }
    const markdown = await Md.parse(await Fs.read(match.path, { text: true }));
    await markdown.content.cancel();
    const { title, dependencies, status, reason, 'duplicate-of': duplicateOf } =
        markdown.frontmatter;
    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error(`Invalid ticket title: ${match.path}`);
    }
    if (dependencies !== undefined && !Array.isArray(dependencies)) {
        throw new Error(`Invalid ticket dependencies: ${match.path}`);
    }
    for (const dependency of dependencies ?? []) {
        if (typeof dependency !== 'string' || !/^\d{4,}$/.test(dependency)) {
            throw new Error(`Invalid ticket dependency: ${match.path}`);
        }
    }

    const ticket = {
        path: match.path,
        id,
        slug: match.slug,
        title,
        dependencies: (dependencies ?? []) as string[],
    };
    if (status === 'open' || status === 'active') {
        return { ...ticket, status };
    }
    if (status !== 'closed') {
        throw new Error(`Invalid ticket status: ${match.path}`);
    }
    if (reason === 'done' || reason === 'dismissed') {
        return { ...ticket, status, reason };
    }
    if (reason !== 'duplicate') {
        throw new Error(`Invalid ticket closure reason: ${match.path}`);
    }
    if (typeof duplicateOf !== 'string' || !/^\d{4,}$/.test(duplicateOf)) {
        throw new Error(`Invalid duplicate-of ticket ID: ${match.path}`);
    }
    return { ...ticket, status, reason, 'duplicate-of': duplicateOf };
}
