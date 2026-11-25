import { Md } from '@md';
import { Path } from '@path';
import { basename, dirname, join, relative, SEPARATOR } from '@std/path';

import { getIdeaTree, type IdeaTree } from '../commands/idea/helpers/get-idea-tree.ts';
import { IdeaFrontmatter } from '../commands/idea/helpers/idea-frontmatter.ts';
import {
    readTicketInventory,
    ticketFilenamePattern,
    ticketReferences,
} from '../tickets/inventory.ts';
import { inspectMarkdownLinks } from '../tickets/plan-links.ts';

type ArchiveRecord = {
    kind: 'plan' | 'ticket';
    path: string;
    status: string;
    files: Set<string>;
    neighbors: Set<ArchiveRecord>;
    reasons: Set<string>;
};

export type ArchiveGroup = {
    plans: string[];
    tickets: string[];
    paths: string[];
};

export type ArchiveSelection = {
    sourceCommit: string;
    eligible: ArchiveGroup[];
    deferred: (ArchiveGroup & { reasons: string[] })[];
};

type GitEntry = { mode: string; oid: string };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

async function git(
    cwd: string,
    signal: AbortSignal,
    args: string[],
): Promise<Uint8Array<ArrayBuffer>> {
    signal.throwIfAborted();
    const result = await new Deno.Command('git', {
        args,
        cwd,
        env: { GIT_OPTIONAL_LOCKS: '0' },
        signal,
        stdin: 'null',
    }).output();
    if (!result.success) {
        throw new Error(`Git ${args[0]} failed: ${decoder.decode(result.stderr).trim()}`);
    }
    return result.stdout;
}

function gitEntries(output: Uint8Array, index: boolean): Map<string, GitEntry> {
    const paths = new Map<string, GitEntry>();
    for (const record of decoder.decode(output).split('\0')) {
        if (record === '') {
            continue;
        }
        const separator = record.indexOf('\t');
        const path = record.slice(separator + 1);
        const [mode, second, third] = record.slice(0, separator).split(' ') as [
            string,
            string,
            string,
        ];
        if (!index || third === '0') {
            paths.set(path, { mode, oid: index ? second : third });
        }
    }
    return paths;
}

function candidate(record: ArchiveRecord): boolean {
    return ['closed', 'archived', 'split'].includes(record.status);
}

function connect(first: ArchiveRecord, second: ArchiveRecord, reason: string): void {
    if (!candidate(first)) {
        second.reasons.add(reason);
    } else if (!candidate(second)) {
        first.reasons.add(reason);
    } else {
        first.neighbors.add(second);
        second.neighbors.add(first);
    }
}

function newRecord(kind: ArchiveRecord['kind'], path: string, status: string): ArchiveRecord {
    return { kind, path, status, files: new Set(), neighbors: new Set(), reasons: new Set() };
}

function addPlans(
    tree: IdeaTree,
    plans: Map<string, ArchiveRecord>,
    display: (path: string) => string,
    parent?: ArchiveRecord,
): void {
    for (const item of tree) {
        const plan = newRecord('plan', item.path, item.frontmatter.status);
        plans.set(item.path, plan);
        if (parent !== undefined) {
            connect(
                parent,
                plan,
                candidate(plan)
                    ? `Parent plan must stay: ${display(parent.path)} (${parent.status}).`
                    : `Child plan must stay: ${display(plan.path)} (${plan.status}).`,
            );
        }
        addPlans(item.children, plans, display, plan);
    }
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        if (!(await Deno.lstat(path)).isDirectory) {
            throw new Error(`Expected a regular directory at "${path}".`);
        }
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
    return true;
}

async function collectArtifacts(
    plan: ArchiveRecord,
    plans: Map<string, ArchiveRecord>,
    directory: string,
    signal: AbortSignal,
): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
        signal.throwIfAborted();
        const path = join(directory, entry.name);
        if (entry.isDirectory) {
            if (!plans.has(path)) {
                await collectArtifacts(plan, plans, path, signal);
            }
        } else {
            plan.files.add(path);
        }
    }
}

function findPlan(
    path: string,
    plansPath: string,
    plans: Map<string, ArchiveRecord>,
): ArchiveRecord | undefined {
    while (path.startsWith(plansPath + SEPARATOR)) {
        const plan = plans.get(path);
        if (plan !== undefined) {
            return plan;
        }
        path = dirname(path);
    }
}

function selectionGroups(
    records: ArchiveRecord[],
    display: (path: string) => string,
): Pick<ArchiveSelection, 'eligible' | 'deferred'> {
    const eligible: ArchiveGroup[] = [];
    const deferred: ArchiveSelection['deferred'] = [];
    const remaining = new Set(
        records.filter(candidate).sort((a, b) => a.path.localeCompare(b.path)),
    );
    for (const first of remaining) {
        const component = [first];
        remaining.delete(first);
        for (const member of component) {
            for (const neighbor of member.neighbors) {
                if (remaining.delete(neighbor)) {
                    component.push(neighbor);
                }
            }
        }
        const group: ArchiveGroup = {
            plans: component
                .filter((item) => item.kind === 'plan')
                .map((item) => display(item.path))
                .sort(),
            tickets: component
                .filter((item) => item.kind === 'ticket')
                .map((item) => display(item.path))
                .sort(),
            paths: component.flatMap((item) => [...item.files].map(display)).sort(),
        };
        const reasons = [...new Set(component.flatMap((item) => [...item.reasons]))].sort();
        if (reasons.length > 0) {
            deferred.push({ ...group, reasons });
        } else {
            eligible.push(group);
        }
    }
    return { eligible, deferred };
}

async function validateFiles(
    root: string,
    paths: string[],
    source: Map<string, GitEntry>,
    index: Map<string, GitEntry>,
    signal: AbortSignal,
): Promise<void> {
    for (const path of paths) {
        signal.throwIfAborted();
        const committed = source.get(path);
        if (committed === undefined) {
            throw new Error(`Archive source file is uncommitted: "${path}".`);
        }
        const staged = index.get(path);
        if (staged?.oid !== committed.oid || staged.mode !== committed.mode) {
            throw new Error(`Archive source file differs in the index: "${path}".`);
        }
        const fullPath = join(root, path);
        let info: Deno.FileInfo;
        try {
            info = await Deno.lstat(fullPath);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(`Archive source file is missing: "${path}".`, { cause: error });
            }
            throw error;
        }
        if (
            !info.isFile ||
            !['100644', '100755'].includes(committed.mode) ||
            (await Deno.realPath(fullPath)) !== fullPath
        ) {
            throw new Error(`Archive source is not a regular file: "${path}".`);
        }
        const mode = info.mode === null ? committed.mode : info.mode & 0o100 ? '100755' : '100644';
        const original = await git(root, signal, ['cat-file', 'blob', committed.oid]);
        const current = await Deno.readFile(fullPath, { signal });
        if (
            mode !== committed.mode ||
            original.length !== current.length ||
            !original.every((byte, offset) => byte === current[offset])
        ) {
            throw new Error(`Archive source file differs in the working tree: "${path}".`);
        }
    }
}

export async function selectArchive(
    projectRoot: string,
    signal: AbortSignal,
): Promise<ArchiveSelection> {
    const root = await Deno.realPath(projectRoot);
    const display = (path: string): string => relative(root, path).split(SEPARATOR).join('/');
    const coderail = join(root, Path.CODERAIL_DIR);
    const plansPath = join(coderail, Path.PLANS_DIR);
    const ticketsPath = join(coderail, Path.TICKETS_DIR);
    const closed = join(ticketsPath, 'closed');
    if (!(await directoryExists(coderail))) {
        throw new Error(`Expected a regular directory at "${coderail}".`);
    }
    if (await directoryExists(ticketsPath)) {
        for (const status of ['open', 'active', 'closed']) {
            await directoryExists(join(ticketsPath, status));
        }
    }
    const sourceCommit = decoder
        .decode(await git(root, signal, ['rev-parse', '--verify', 'HEAD^{commit}']))
        .trim();
    const [tree, inventory, treeOutput, indexOutput] = await Promise.all([
        directoryExists(plansPath).then((exists) => (exists ? getIdeaTree(root) : [])),
        readTicketInventory(root, signal),
        git(root, signal, ['ls-tree', '-r', '-z', sourceCommit, '--', Path.CODERAIL_DIR]),
        git(root, signal, ['ls-files', '--stage', '-z', '--', Path.CODERAIL_DIR]),
    ]);
    if (inventory.findings.length > 0) {
        const findings = inventory.findings.map(
            ({ message, details }) =>
                `${message}: ${details.map(({ value }) => value).join(' · ')}`,
        );
        throw new Error(
            `Cannot inspect tickets. Run "cr doctor" to review ticket metadata.\n${findings.join('\n')}`,
        );
    }
    const source = gitEntries(treeOutput, false);
    const index = gitEntries(indexOutput, true);
    const plans = new Map<string, ArchiveRecord>();
    addPlans(tree, plans, display);
    for (const plan of plans.values()) {
        await collectArtifacts(plan, plans, plan.path, signal);
    }
    const ticketRecords = [...inventory.byPath.values()].map((item) => {
        const ticket = newRecord('ticket', item.path, item.status);
        ticket.files.add(item.path);
        return { item, ticket };
    });
    const tickets = new Map(ticketRecords.map(({ ticket }) => [ticket.path, ticket]));
    const ticketsById = new Map(ticketRecords.map(({ item, ticket }) => [item.id, ticket]));
    for (const [path, entry] of source) {
        const fullPath = join(root, path);
        if (dirname(fullPath) === closed && !tickets.has(fullPath)) {
            const id = /^(\d{4,})-/.exec(basename(fullPath))?.[1];
            if (id !== undefined && !inventory.byId.has(id)) {
                throw new Error(`Archive source ticket is missing: "${path}".`);
            }
        }
        const owner = findPlan(fullPath, plansPath, plans);
        if (owner !== undefined) {
            // A selected directory includes artifacts removed from the working tree.
            owner.files.add(fullPath);
        } else if (basename(fullPath) === 'IDEA.md' && dirname(dirname(fullPath)) === plansPath) {
            const original = await git(root, signal, ['cat-file', 'blob', entry.oid]);
            const markdown = await Md.parse(
                new Blob([original]).stream().pipeThrough(new TextDecoderStream()),
            );
            await markdown.content.cancel();
            if (
                IdeaFrontmatter.isIdeaFrontmatter(markdown.frontmatter) &&
                ['archived', 'split'].includes(markdown.frontmatter.status)
            ) {
                throw new Error(`Archive source plan is missing: "${path}".`);
            }
        }
    }
    for (const { item, ticket } of ticketRecords) {
        for (const { id, kind } of ticketReferences(item)) {
            const linked = ticketsById.get(id);
            if (linked === undefined) {
                throw new Error(
                    `Invalid ticket ${kind} in "${display(item.path)}": missing ticket "${id}". Run "cr doctor".`,
                );
            }
            const retained = candidate(ticket) ? linked : ticket;
            connect(
                ticket,
                linked,
                `Ticket must stay: ${display(retained.path)} (${retained.status} ${kind}).`,
            );
        }
    }

    const links: {
        document: string;
        path: string;
        destination: string;
        requiresDirectory: boolean;
    }[] = [];
    const warnings = await inspectMarkdownLinks(
        root,
        '.',
        [Path.PLANS_DIR, Path.TICKETS_DIR],
        signal,
        (link) => links.push(link),
    );
    if (warnings.length > 0) {
        throw new Error(
            warnings.map(({ path, message }) => `${display(path)}: ${message}`).join('\n'),
        );
    }
    for (const { document, path, destination, requiresDirectory } of links) {
        signal.throwIfAborted();
        const stale = (): Error =>
            new Error(
                `Stale archive link in "${display(document)}": "${destination}". Run "cr doctor" to review links.`,
            );
        if (path.startsWith(ticketsPath + SEPARATOR)) {
            if (!ticketFilenamePattern.test(basename(path))) {
                continue;
            }
            if (requiresDirectory || !tickets.has(path)) {
                throw stale();
            }
        } else {
            const info = await Deno.lstat(path).catch((error) => {
                if (
                    error instanceof Deno.errors.NotFound ||
                    error instanceof Deno.errors.NotADirectory
                ) {
                    throw stale();
                }
                throw error;
            });
            if (
                (!info.isDirectory && (requiresDirectory || !info.isFile)) ||
                (await Deno.realPath(path)) !== path
            ) {
                throw stale();
            }
        }
        const from = tickets.get(document) ?? findPlan(document, plansPath, plans);
        const linked = tickets.get(path) ?? findPlan(path, plansPath, plans);
        if (linked === undefined || !candidate(linked)) {
            if (from?.kind === 'plan' && linked?.kind === 'ticket' && candidate(from)) {
                from.reasons.add(`Linked ticket must stay: ${display(path)} (${linked.status}).`);
            }
        } else if (from === undefined || !candidate(from)) {
            linked.reasons.add(`Referenced by retained Markdown: ${display(document)}.`);
        } else {
            connect(from, linked, '');
        }
    }
    const groups = selectionGroups([...plans.values(), ...tickets.values()], display);
    await validateFiles(
        root,
        groups.eligible.flatMap(({ paths }) => paths),
        source,
        index,
        signal,
    );
    return { sourceCommit, ...groups };
}
