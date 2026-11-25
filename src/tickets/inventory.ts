import { Log } from '@log';
import { type Frontmatter, Md } from '@md';
import { join, relative } from '@std/path';
import { Text } from '@utils';

export const ticketFilenamePattern = /^(\d{4,})-([a-z0-9-]+)\.md$/;

const statuses = ['open', 'active', 'closed'];
function validId(value: Frontmatter[string]): value is string {
    return typeof value === 'string' && /^\d{4,}$/.test(value);
}
function nonblank(value: Frontmatter[string]): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

/** Keep partial, validated identity even when other fields are unavailable or invalid. */
export type InventoryItem = {
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
    filenameFinding?: InventoryFinding;
    placementFinding?: InventoryFinding;
};

type Details = { label: string; value: string }[];

type InventoryFinding = {
    message: string;
    details: Details;
    repairable: boolean;
    manualRepair: string[];
};

export type TicketInventory = {
    findings: InventoryFinding[];
    skipped: string[];
    inventory: InventoryItem[];
    inventoryComplete: boolean;
    byId: Map<string, InventoryItem[]>;
    target: (id: string) => InventoryItem | string;
    byPath: Map<string, InventoryItem & { id: string; status: string }>;
    fail: (
        path: string,
        message: string,
        guidance: string,
        details?: Details,
        pathLabel?: string,
    ) => InventoryFinding;
};

export async function readTicketInventory(
    projectRoot: string,
    signal: AbortSignal,
): Promise<TicketInventory> {
    const findings: InventoryFinding[] = [];
    const skipped: string[] = [];
    const inventory: InventoryItem[] = [];
    let inventoryComplete = true;
    const directory = join(projectRoot, '.coderail', 'tickets');
    const display = (path: string): string => relative(projectRoot, path);
    const fail: TicketInventory['fail'] = (
        path,
        message,
        guidance,
        details = [],
        pathLabel = 'File',
    ) => {
        const failure = {
            message,
            details: [{ label: pathLabel, value: display(path) }, ...details],
            repairable: false,
            manualRepair: [guidance],
        };
        findings.push(failure);
        return failure;
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
                let filenameFinding: InventoryFinding | undefined;
                if (!ticketFilenamePattern.test(entry.name)) {
                    filenameFinding = fail(
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
                    const item: InventoryItem = { path, original, usable: true, filenameFinding };
                    inventory.push(item);
                    const invalid = (field: string, requirement: string): void => {
                        item.usable = false;
                        fail(
                            path,
                            `Invalid ticket ${field}`,
                            `Correct frontmatter ${field} after verifying the intended metadata.`,
                            [
                                {
                                    label: 'Current',
                                    value:
                                        field === 'title/slug'
                                            ? JSON.stringify([fields.title, fields.slug])
                                            : (JSON.stringify(fields[field]) ?? '(missing)'),
                                },
                                { label: 'Expected', value: requirement },
                            ],
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
                            item.placementFinding = fail(
                                path,
                                'Incorrect placement',
                                'Resolve metadata conflicts, then move the file to the expected path without rewriting its metadata.',
                                [
                                    { label: 'Ticket', value: item.id },
                                    { label: 'Expected file', value: display(item.expectedPath) },
                                ],
                            );
                        }
                    }
                } catch (error) {
                    signal.throwIfAborted();
                    inventoryComplete = false;
                    fail(
                        path,
                        'Ticket metadata unavailable',
                        'Restore readable, valid Markdown frontmatter and check file access permissions.',
                        [{ label: 'Error', value: String(error) }],
                    );
                    skipped.push(`Ticket metadata checks unavailable for "${display(path)}".`);
                }
            }
        } catch (error) {
            signal.throwIfAborted();
            if (error instanceof Deno.errors.NotFound) {
                skipped.push(`Ticket directory "${display(folder)}": absent.`);
            } else {
                inventoryComplete = false;
                fail(
                    folder,
                    'Ticket inventory unavailable',
                    'Restore directory access and rerun "cr doctor".',
                    [{ label: 'Error', value: String(error) }],
                    'Directory',
                );
                skipped.push(`Ticket inventory unavailable for "${display(folder)}".`);
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
                'Duplicate ticket ID',
                'Resolve duplicate frontmatter IDs and their references manually.',
                [
                    { label: 'Ticket', value: id },
                    ...matches.map((item) => ({ label: 'Candidate', value: display(item.path) })),
                ],
                'Directory',
            );
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
            return `Ambiguous target "${id}": ${matches.map((item) => display(item.path)).join(', ')}`;
        }
        const item = matches[0] as InventoryItem;
        return item.usable ? item : `Unusable target "${id}" at "${display(item.path)}"`;
    };
    const byPath = new Map(
        inventory.flatMap((item) =>
            item.id !== undefined &&
            item.status !== undefined &&
            item.path === item.expectedPath &&
            target(item.id) === item
                ? [[item.path, { ...item, id: item.id, status: item.status }] as const]
                : [],
        ),
    );
    return { findings, skipped, inventory, inventoryComplete, byId, byPath, fail, target };
}

export function ticketReferences(item: InventoryItem): { kind: string; id: string }[] {
    return [
        ...(item.dependencies ?? []).map((id) => ({ kind: 'dependency', id })),
        ...(item.duplicateOf === undefined ? [] : [{ kind: 'duplicate-of', id: item.duplicateOf }]),
    ];
}
