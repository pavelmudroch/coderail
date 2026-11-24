import { Log } from '@log';
import { type Frontmatter, Md } from '@md';
import { dirname, join, relative, resolve } from '@std/path';
import {
    scanTicketLinks,
    type TicketLinkTarget,
    updateTicketLinks,
    withTicketLock,
} from '@tickets';
import { Text } from '@utils';

import { inspectPlanTicketLinks } from '../../tickets/plan-links.ts';
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
    slug?: string;
    expectedPath?: string;
    dependencies?: string[];
    duplicateOf?: string;
    status?: string;
    reason?: string;
    usable: boolean;
};

type TicketInventory = {
    report: DoctorReport;
    inventory: InventoryItem[];
    inventoryComplete: boolean;
    byId: Map<string, InventoryItem[]>;
    directory: string;
    fail: (path: string, message: string, guidance: string) => void;
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

async function readInventory(projectRoot: string, signal: AbortSignal): Promise<TicketInventory> {
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
                        item.slug = fields.slug as string;
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
    return { report, inventory, inventoryComplete, byId, directory, fail };
}

async function repairTicket(
    projectRoot: string,
    item: InventoryItem,
    collected: TicketLinkTarget,
    signal: AbortSignal,
): Promise<void> {
    await withTicketLock(projectRoot, collected.id, signal, async () => {
        const fresh = await readInventory(projectRoot, signal);
        const matches = fresh.byId.get(collected.id);
        const current = matches?.[0];
        if (
            !fresh.inventoryComplete ||
            matches?.length !== 1 ||
            !current?.usable ||
            current.slug !== collected.slug ||
            current.expectedPath === undefined
        ) {
            throw new Error(`Ticket repair is no longer eligible for "${item.path}"`);
        }
        const target = { ...collected, path: current.expectedPath };
        const moving = current.path !== target.path;
        if (
            moving &&
            (item.path === collected.path ||
                current.path !== item.path ||
                !(await unoccupied(target.path)))
        ) {
            throw new Error(`Ticket relocation is no longer eligible at "${item.path}"`);
        }
        const scan = await scanTicketLinks(projectRoot, target, signal);
        await regularPath(current.path, signal);
        if (moving) {
            const destinationDirectory = dirname(target.path);
            await Deno.mkdir(destinationDirectory, { recursive: true });
            await regularPath(current.path, signal);
            if ((await Deno.realPath(destinationDirectory)) !== resolve(destinationDirectory)) {
                throw new Error(`Ticket destination contains symlinks: "${target.path}"`);
            }
        }
        const original = moving ? item.original : current.original;
        const bytes = await Deno.readFile(current.path, { signal });
        if (
            bytes.length !== original.length ||
            bytes.some((byte, index) => byte !== original[index])
        ) {
            throw new Error(`Collected input changed at "${current.path}"`);
        }
        signal.throwIfAborted();
        if (moving) {
            // Hard-link creation is exclusive, and the source is removed only after it succeeds.
            await Deno.link(current.path, target.path);
            await Deno.remove(current.path);
        }
        const warnings = await updateTicketLinks(projectRoot, target, scan, signal);
        const failures = [...scan.warnings, ...warnings];
        if (failures.length) {
            throw new Error(
                failures.map(({ path, message }) => `"${path}": ${message}`).join('\n'),
            );
        }
    });
}

async function check(projectRoot: string, signal: AbortSignal): Promise<DoctorReport> {
    signal.throwIfAborted();
    const root = await Deno.realPath(resolve(projectRoot));
    const { report, inventory, inventoryComplete, byId, directory, fail } = await readInventory(
        root,
        signal,
    );
    for (const [id, matches] of byId) {
        if (matches.length > 1) {
            fail(
                directory,
                `Duplicate ticket ID "${id}": ${matches.map((item) => `"${item.path}"`).join(', ')}`,
                'Resolve duplicate frontmatter IDs and their references manually; no file is selected as authoritative.',
            );
        }
    }
    const repairs = new Map<string, DoctorRepair>();
    for (const item of inventory) {
        const destination = item.expectedPath;
        const { id, slug } = item;
        const moving = destination !== item.path;
        if (
            !inventoryComplete ||
            !item.usable ||
            id === undefined ||
            byId.get(id)?.length !== 1 ||
            slug === undefined ||
            destination === undefined ||
            (moving && !(await unoccupied(destination)))
        ) {
            continue;
        }
        const repair: DoctorRepair = {
            key: `ticket:${id}`,
            description: moving
                ? `Move ticket "${item.path}" to "${destination}"`
                : `Update plan links for ticket "${id}"`,
            apply: (actionSignal) =>
                repairTicket(root, item, { id, slug, path: destination }, actionSignal),
        };
        repairs.set(id, repair);
        if (moving) {
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
    const warnings = await inspectPlanTicketLinks(root, signal, (link) => {
        const resolved = target(link.id);
        const prefix = `Plan "${link.document}": ticket link "${link.destination}"`;
        if (typeof resolved === 'string' || resolved.slug !== link.slug) {
            const issue =
                typeof resolved === 'string'
                    ? resolved
                    : `No target with authoritative slug "${link.slug}" for ticket "${link.id}"`;
            report.failures.push({
                message: `${prefix}: ${issue}`,
                repairable: false,
                manualRepair: [
                    'Verify the intended ticket identity and correct the link manually.',
                ],
            });
            return;
        }
        const expected = resolved.expectedPath as string;
        if (link.ticketPath !== relative(root, expected)) {
            const repair = repairs.get(link.id);
            report.failures.push({
                message: `${prefix}: Stale destination; expected ticket at "${expected}"`,
                repairable: repair !== undefined,
                repair,
                manualRepair: ['Confirm the authoritative ticket path, then update the plan link.'],
            });
        }
    });
    for (const { path, message } of warnings) {
        report.failures.push({
            message: `Plan "${path}": ${message}`,
            repairable: false,
            manualRepair: ['Restore access to valid UTF-8 Markdown and rerun "cr doctor".'],
        });
    }
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
