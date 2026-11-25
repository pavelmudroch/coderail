import { dirname, relative, resolve } from '@std/path';
import {
    scanTicketLinks,
    type TicketLinkTarget,
    updateTicketLinks,
    withTicketLock,
} from '@tickets';

import {
    type InventoryItem,
    readTicketInventory,
    ticketReferences,
} from '../../tickets/inventory.ts';
import { inspectPlanTicketLinks, planTicketDestination } from '../../tickets/plan-links.ts';
import { type DoctorFailure, type DoctorRepair, type DoctorReport } from './types.ts';

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

async function repairTicket(
    projectRoot: string,
    item: InventoryItem,
    collected: TicketLinkTarget,
    signal: AbortSignal,
): Promise<void> {
    await withTicketLock(projectRoot, collected.id, signal, async () => {
        const fresh = await readTicketInventory(projectRoot, signal);
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
    const { findings, skipped, inventory, inventoryComplete, byId, fail, target } =
        await readTicketInventory(root, signal);
    const report: DoctorReport = { failures: findings, skipped };
    const display = (path: string): string => relative(root, path);
    const repairs = new Map<string, DoctorRepair>();
    for (const item of inventory) {
        const destination = item.expectedPath;
        const { id, slug } = item;
        const moving = destination !== item.path;
        const repairKey = id === undefined ? undefined : `ticket:${id}`;
        for (const failure of [item.filenameFinding, item.placementFinding] as (
            DoctorFailure | undefined
        )[]) {
            if (failure) {
                failure.repairKey = repairKey;
            }
        }
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
                ? `Move ticket "${display(item.path)}" to "${display(destination)}"`
                : `Update plan links for ticket "${id}"`,
            apply: (actionSignal) =>
                repairTicket(root, item, { id, slug, path: destination }, actionSignal),
        };
        repairs.set(id, repair);
        for (const failure of [item.filenameFinding, item.placementFinding] as (
            DoctorFailure | undefined
        )[]) {
            if (failure) {
                failure.repairable = true;
                failure.repair = repair;
            }
        }
    }
    const warnings = await inspectPlanTicketLinks(root, signal, (link) => {
        const resolved = target(link.id);
        const context = [
            { label: 'Plan', value: display(link.document) },
            { label: 'Current link', value: link.destination },
        ];
        if (typeof resolved === 'string' || resolved.slug !== link.slug) {
            const issue =
                typeof resolved === 'string'
                    ? resolved
                    : `Ticket has authoritative slug "${resolved.slug}" at "${display(resolved.path)}"`;
            report.failures.push({
                message: `Unresolved ticket link · ${link.id}`,
                details: [...context, { label: 'Target', value: issue }],
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
                message: `Stale ticket link · ${link.id}`,
                details: [
                    ...context,
                    {
                        label: 'Expected link',
                        value: planTicketDestination(link.document, expected, link.destination),
                    },
                ],
                repairable: repair !== undefined,
                repairKey: `ticket:${link.id}`,
                repair,
                manualRepair: ['Update the link to the expected destination.'],
            });
        }
    });
    for (const { path, message } of warnings) {
        report.failures.push({
            message: 'Plan ticket links unavailable',
            details: [
                { label: 'Plan', value: display(path) },
                { label: 'Error', value: message },
            ],
            repairable: false,
            manualRepair: ['Restore access to valid UTF-8 Markdown and rerun "cr doctor".'],
        });
    }
    const label = (item: InventoryItem): string => `"${item.id}" (${display(item.path)})`;
    const guidance =
        'Correct the referenced ticket metadata and required chain manually; do not remove edges or change closure reasons without reviewing intent.';
    for (const item of inventory) {
        for (const edge of ticketReferences(item)) {
            const resolved = target(edge.id);
            if (typeof resolved === 'string') {
                fail(item.path, 'Invalid ticket reference', guidance, [
                    { label: 'Reference', value: edge.kind },
                    { label: 'Target', value: resolved },
                ]);
            }
            if (edge.id === item.id) {
                fail(item.path, 'Ticket self-reference', guidance, [
                    { label: 'Reference', value: edge.kind },
                    { label: 'Ticket', value: edge.id },
                ]);
            }
        }
    }
    // All edge kinds participate in historical integrity, including edges from done tickets.
    const visited = new Set<InventoryItem>();
    const active: InventoryItem[] = [];
    const visit = (item: InventoryItem): void => {
        signal.throwIfAborted();
        if (active.includes(item)) {
            fail(item.path, 'Ticket graph cycle', guidance, [
                {
                    label: 'Chain',
                    value: [...active.slice(active.indexOf(item)), item].map(label).join(' -> '),
                },
            ]);
            return;
        }
        if (visited.has(item)) {
            return;
        }
        visited.add(item);
        active.push(item);
        for (const edge of ticketReferences(item)) {
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
                fail(item.path, 'Blocked progression', guidance, [
                    { label: 'Chain', value: cause },
                ]);
            }
        }
    }
    return report;
}

export const Tickets = { check };
