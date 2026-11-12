import { Log } from '@log';
import { type Frontmatter, Md } from '@md';
import { dirname, join, resolve } from '@std/path';
import { Text } from '@utils';

import { createDoctorReport, type DoctorRepair, type DoctorReport } from './types.ts';

const statuses = ['open', 'active', 'closed'];
function validId(value: Frontmatter[string]): value is string {
    return typeof value === 'string' && /^\d{4,}$/.test(value);
}
function nonblank(value: Frontmatter[string]): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

/** Keep partial, validated identity even when other fields are unavailable or invalid. */
type InventoryItem = {
    path: string;
    original: Uint8Array;
    id?: string;
    expectedPath?: string;
    dependencies?: string[];
    duplicateOf?: string;
    status?: string;
    reason?: string;
    usable: boolean;
};

/** Reject symlinks in either path before linking or removing ticket files. */
async function regularPath(path: string, signal: AbortSignal): Promise<void> {
    let current = resolve(path);
    while (true) {
        signal.throwIfAborted();
        const info = await Deno.lstat(current);
        if (current === resolve(path) ? !info.isFile : !info.isDirectory) {
            throw new Error(`Expected regular ticket file and directories at "${current}"`);
        }
        const parent = dirname(current);
        if (parent === current) {
            return;
        }
        current = parent;
    }
}

async function unoccupied(path: string): Promise<boolean> {
    try {
        await Deno.lstat(path);
        return false;
    } catch (error) {
        return error instanceof Deno.errors.NotFound;
    }
}

async function check(projectRoot: string, signal: AbortSignal): Promise<DoctorReport> {
    const report = createDoctorReport();
    const inventory: InventoryItem[] = [];
    let inventoryComplete = true;
    const directory = join(projectRoot, '.coderail', 'tickets');
    const fail = (path: string, message: string, guidance: string): void => {
        report.failures.push({
            message: `Ticket "${path}": ${message}`,
            repairable: false,
            manualRepair: [guidance],
        });
    };
    for (const status of statuses) {
        signal.throwIfAborted();
        const folder = join(directory, status);
        Log.notice(`Discovering ticket files "${folder}".`);
        try {
            for await (const entry of Deno.readDir(folder)) {
                signal.throwIfAborted();
                if (entry.isDirectory) {
                    continue;
                }
                const path = join(folder, entry.name);
                Log.notice(`Checking ticket metadata and placement "${path}".`);
                if (!/^\d{4,}-[a-z0-9-]+\.md$/.test(entry.name)) {
                    fail(
                        path,
                        'Invalid ticket filename',
                        'Rename the file to <id>-<slug>.md after validating its frontmatter.',
                    );
                }
                try {
                    if (!entry.isFile) {
                        throw new Error(
                            'Expected a regular file; inspect unsupported file types manually',
                        );
                    }
                    const original = await Deno.readFile(path, { signal });
                    const markdown = await Md.parse(
                        new Blob([original]).stream().pipeThrough(new TextDecoderStream()),
                    );
                    await markdown.content.cancel();
                    signal.throwIfAborted();
                    const fields = markdown.frontmatter;
                    const item: InventoryItem = { path, original, usable: true };
                    inventory.push(item);
                    const invalid = (field: string, requirement: string): void => {
                        item.usable = false;
                        fail(
                            path,
                            `Invalid ${field}: ${requirement}`,
                            `Correct frontmatter ${field} in "${path}"; ${requirement}. Do not infer metadata from its filename or directory.`,
                        );
                    };
                    if (validId(fields.id)) {
                        item.id = fields.id;
                    } else {
                        inventoryComplete = false;
                        invalid('id', 'expected a string of at least four digits');
                    }
                    const titleValid = nonblank(fields.title) && !/[/\\]/.test(fields.title);
                    const slugValid = nonblank(fields.slug) && /^[a-z0-9-]+$/.test(fields.slug);
                    if (!titleValid) {
                        invalid('title', 'expected a nonblank title without path separators');
                    }
                    if (!slugValid) {
                        invalid('slug', 'expected a nonempty lowercase filename slug');
                    }
                    const consistent =
                        titleValid &&
                        slugValid &&
                        Text.slugify(fields.title as string) === fields.slug;
                    if (titleValid && slugValid && !consistent) {
                        invalid('title/slug', 'slug must equal Text.slugify(title)');
                    }
                    const statusValid =
                        typeof fields.status === 'string' && statuses.includes(fields.status);
                    if (statusValid) {
                        item.status = fields.status as string;
                    }
                    if (typeof fields.reason === 'string') {
                        item.reason = fields.reason;
                    }
                    if (!statusValid) {
                        invalid('status', 'expected open, active or closed');
                    }
                    for (const field of ['created_at', 'updated_at']) {
                        if (!nonblank(fields[field])) {
                            invalid(field, 'expected a nonblank timestamp string');
                        }
                    }
                    if (fields.dependencies === undefined) {
                        item.dependencies = [];
                    } else if (
                        Array.isArray(fields.dependencies) &&
                        fields.dependencies.every(validId)
                    ) {
                        item.dependencies = fields.dependencies;
                    } else {
                        invalid(
                            'dependencies',
                            'expected an array of string ticket IDs with at least four digits',
                        );
                    }
                    if (fields.status === 'closed') {
                        if (!['done', 'dismissed', 'duplicate'].includes(fields.reason as string)) {
                            invalid(
                                'reason',
                                'closed tickets require done, dismissed or duplicate',
                            );
                        }
                        if (fields.reason === 'duplicate') {
                            if (validId(fields['duplicate-of'])) {
                                item.duplicateOf = fields['duplicate-of'];
                            } else {
                                invalid(
                                    'duplicate-of',
                                    'duplicate closures require a string ticket ID with at least four digits',
                                );
                            }
                        }
                    } else if (fields.reason !== undefined) {
                        invalid('reason', 'closure reason requires closed status');
                    }
                    if (
                        fields['duplicate-of'] !== undefined &&
                        !(fields.status === 'closed' && fields.reason === 'duplicate')
                    ) {
                        invalid('duplicate-of', 'requires closed status and duplicate reason');
                    }
                    if (item.id !== undefined && consistent && statusValid) {
                        item.expectedPath = join(
                            directory,
                            fields.status as string,
                            `${item.id}-${fields.slug}.md`,
                        );
                        if (path !== item.expectedPath) {
                            fail(
                                path,
                                `Incorrect placement; expected "${item.expectedPath}" from frontmatter`,
                                `After resolving metadata conflicts, move this file to "${item.expectedPath}" without rewriting its metadata.`,
                            );
                        }
                    }
                } catch (error) {
                    signal.throwIfAborted();
                    inventoryComplete = false;
                    fail(
                        path,
                        `Metadata unavailable: ${String(error)}`,
                        `Restore readable, valid Markdown frontmatter in "${path}" and check file access permissions.`,
                    );
                    report.skipped.push(`Ticket metadata checks unavailable for "${path}".`);
                }
            }
        } catch (error) {
            signal.throwIfAborted();
            if (error instanceof Deno.errors.NotFound) {
                report.skipped.push(`Ticket directory "${folder}": absent.`);
            } else {
                inventoryComplete = false;
                fail(
                    folder,
                    `Inventory unavailable: ${String(error)}`,
                    `Restore directory access to "${folder}" and rerun "cr doctor".`,
                );
                report.skipped.push(`Ticket inventory unavailable for "${folder}".`);
            }
        }
    }
    const byId = new Map<string, InventoryItem[]>();
    for (const item of inventory) {
        if (item.id !== undefined) {
            const matches = byId.get(item.id) ?? [];
            matches.push(item);
            byId.set(item.id, matches);
        }
    }
    for (const [id, matches] of byId) {
        if (matches.length > 1) {
            fail(
                directory,
                `Duplicate ticket ID "${id}": ${matches.map((item) => `"${item.path}"`).join(', ')}`,
                'Resolve duplicate frontmatter IDs and their references manually; no file is selected as authoritative.',
            );
        }
    }
    // Attach actions only after the complete identity inventory has ruled out ambiguity.
    for (const item of inventory) {
        const destination = item.expectedPath;
        if (
            !inventoryComplete ||
            !item.usable ||
            item.id === undefined ||
            byId.get(item.id)?.length !== 1 ||
            destination === undefined ||
            destination === item.path ||
            !(await unoccupied(destination))
        ) {
            continue;
        }
        const repair: DoctorRepair = {
            key: `ticket-placement:${resolve(item.path)}`,
            description: `Move ticket "${item.path}" to "${destination}"`,
            async apply(actionSignal: AbortSignal): Promise<void> {
                await regularPath(item.path, actionSignal);
                const fresh = await check(projectRoot, actionSignal);
                if (!fresh.failures.some((failure) => failure.repair?.key === repair.key)) {
                    throw new Error(`Ticket relocation is no longer eligible at "${item.path}"`);
                }
                await Deno.mkdir(dirname(destination), { recursive: true });
                // Validate the destination ancestry too, including newly created directories.
                await regularPath(item.path, actionSignal);
                if ((await Deno.realPath(dirname(destination))) !== resolve(dirname(destination))) {
                    throw new Error(`Ticket destination contains symlinks: "${destination}"`);
                }
                // Revalidate after the inventory rescan and directory preparation: unchanged
                // bytes also bind fresh eligibility to the collected identity and destination.
                const current = await Deno.readFile(item.path, { signal: actionSignal });
                if (
                    current.length !== item.original.length ||
                    current.some((byte, index) => byte !== item.original[index])
                ) {
                    throw new Error(`Collected input changed at "${item.path}"`);
                }
                actionSignal.throwIfAborted();
                // link is an atomic, exclusive destination creation; rename would clobber.
                // Finish unlinking even if cancelled after the link has completed.
                await Deno.link(item.path, destination);
                await Deno.remove(item.path);
            },
        };
        for (const failure of report.failures) {
            if (
                failure.message.startsWith(`Ticket "${item.path}":`) &&
                /Invalid ticket filename|Incorrect placement/.test(failure.message)
            ) {
                failure.repairable = true;
                failure.repair = repair;
            }
        }
    }
    // Resolve only by validated metadata identity, never by a filename hint.
    const target = (id: string): InventoryItem | string => {
        const matches = byId.get(id);
        if (matches === undefined) {
            return inventoryComplete
                ? `Missing target "${id}"`
                : `Unavailable target "${id}" (inventory incomplete)`;
        }
        if (matches.length > 1) {
            return `Ambiguous target "${id}": ${matches.map((item) => item.path).join(', ')}`;
        }
        const item = matches[0] as InventoryItem;
        return item.usable ? item : `Unusable target "${id}" at "${item.path}"`;
    };
    const edges = (item: InventoryItem): { kind: string; id: string }[] => [
        ...(item.dependencies ?? []).map((id) => ({ kind: 'dependency', id })),
        ...(item.duplicateOf === undefined ? [] : [{ kind: 'duplicate-of', id: item.duplicateOf }]),
    ];
    const label = (item: InventoryItem): string => `"${item.id}" (${item.path})`;
    const guidance =
        'Correct the referenced ticket metadata and required chain manually; do not remove edges or change closure reasons without reviewing intent.';
    for (const item of inventory) {
        for (const edge of edges(item)) {
            const resolved = target(edge.id);
            if (typeof resolved === 'string') {
                fail(item.path, `${edge.kind}: ${resolved}`, guidance);
            }
            if (edge.id === item.id) {
                fail(item.path, `Self-reference via ${edge.kind}: ${label(item)}`, guidance);
            }
        }
    }
    // All edge kinds participate in historical integrity, including edges from done tickets.
    const visited = new Set<InventoryItem>();
    const active: InventoryItem[] = [];
    const visit = (item: InventoryItem): void => {
        signal.throwIfAborted();
        if (active.includes(item)) {
            fail(
                item.path,
                `Graph cycle: ${[...active.slice(active.indexOf(item)), item].map(label).join(' -> ')}`,
                guidance,
            );
            return;
        }
        if (visited.has(item)) {
            return;
        }
        visited.add(item);
        active.push(item);
        for (const edge of edges(item)) {
            const resolved = target(edge.id);
            if (typeof resolved !== 'string') {
                visit(resolved);
            }
        }
        active.pop();
    };
    for (const item of inventory) {
        if (item.id !== undefined && target(item.id) === item) {
            visit(item);
        }
    }
    // Pending work is healthy unless one of its required chains has a concrete blocker.
    const blockers = (id: string, chain: InventoryItem[]): string[] => {
        signal.throwIfAborted();
        const item = target(id);
        if (typeof item === 'string') {
            return [[...chain.map(label), item].join(' -> ')];
        }
        const path = [...chain, item];
        const cause = (message: string): string[] => [
            `${path.map(label).join(' -> ')}: ${message}`,
        ];
        if (item.status === 'closed' && item.reason === 'done') {
            return [];
        }
        if (chain.includes(item)) {
            return cause('unresolvable cycle');
        }
        if (item.status === 'closed') {
            if (item.reason === 'dismissed') {
                return cause('dismissed');
            }
            return blockers(item.duplicateOf as string, path);
        }
        return (item.dependencies as string[]).flatMap((dependency) => blockers(dependency, path));
    };
    for (const item of inventory) {
        if (
            (item.status === 'open' || item.status === 'active') &&
            item.id !== undefined &&
            target(item.id) === item
        ) {
            for (const cause of blockers(item.id, [])) {
                fail(item.path, `Blocked progression: ${cause}`, guidance);
            }
        }
    }
    return report;
}

export const Tickets = { check };
