import type { Manifest, ManifestFile } from '@install-manifest';
import {
    canonicalRoot,
    fingerprint,
    InstallManifest,
    regularFile,
    validate,
    validatePath,
} from '@install-manifest';
import { dirname, join } from '@std/path';

import type { StagedDistribution } from './distribution.ts';

/** Separate from harness ownership. Schema 1 uses the shared checksum/size schema.
 * libexec entries are reserved for activation/cleanup consumers; assets never
 * retire executables. Consumers must serialize planning through activation at
 * the installation root, and activate only after applyAssets resolves. Missing
 * or empty staged resource roots represent empty incoming sets; existing roots
 * must be real directories, and other inspection errors propagate.
 */
export const DISTRIBUTION_MANIFEST = '.coderail-distribution.json';
export type AssetAction = {
    kind: 'write' | 'remove';
    file: ManifestFile;
    source?: string;
    approved: boolean;
};
export type AssetPlan = {
    root: string;
    manifest: Manifest;
    actions: AssetAction[];
    absent: string[];
    /** Verified running bootstrap binary may be claimed by activation without overwriting it. */
    bootstrap?: ManifestFile;
};
export type AssetOptions = {
    force?: boolean;
    yes?: boolean;
    no?: boolean;
    interactive?: boolean;
    confirm?: (action: AssetAction) => boolean | Promise<boolean>;
    runningExecutable?: string;
};

export function ownedPath(path: string): void {
    validatePath(path);
    if (
        !/^(instructions|templates)\/.+/.test(path) &&
        !/^libexec\/cr-[A-Za-z0-9_.-]+$/.test(path)
    ) {
        throw new Error(`Invalid distribution ownership path: ${path}`);
    }
}

async function inspectDestination(root: string, path: string): Promise<boolean> {
    validatePath(path);
    let current = root;
    const parts = path.split('/');
    for (const [index, part] of parts.entries()) {
        current = join(current, part);
        let info: Deno.FileInfo;
        try {
            info = await Deno.lstat(current);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return false;
            }
            throw error;
        }
        if (info.isSymlink || (index < parts.length - 1 ? !info.isDirectory : !info.isFile)) {
            throw new Error(`Unsafe distribution destination: ${path}`);
        }
    }
    return true;
}

async function resources(root: string, directory: string): Promise<ManifestFile[]> {
    const result: ManifestFile[] = [];
    try {
        await regularDirectory(root, directory);
    } catch (error) {
        if (
            error instanceof Deno.errors.NotFound &&
            ['instructions', 'templates'].includes(directory)
        ) {
            return result;
        }
        throw error;
    }
    for await (const entry of Deno.readDir(join(root, directory))) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory) {
            result.push(...(await resources(root, path)));
        } else {
            result.push({ path, ...(await fingerprint(await regularFile(root, path))) });
        }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
}

async function regularDirectory(root: string, path: string): Promise<void> {
    let current = root;
    for (const part of path.split('/')) {
        current = join(current, part);
        const info = await Deno.lstat(current);
        if (!info.isDirectory || info.isSymlink) {
            throw new Error('Unsafe staged directory');
        }
    }
}

export async function planAssets(
    installation: string,
    stage: StagedDistribution,
    options: AssetOptions = {},
): Promise<AssetPlan> {
    const root = await canonicalRoot(installation);
    await inspectDestination(root, DISTRIBUTION_MANIFEST);
    const manifest = (await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST))) ?? {
        version: 1,
        files: [],
    };
    validate(manifest);
    const destinations = new Map<string, boolean>();
    for (const file of manifest.files) {
        ownedPath(file.path);
        destinations.set(file.path, await inspectDestination(root, file.path));
    }
    const staged = await canonicalRoot(stage.root);
    const incoming = [
        ...(await resources(staged, 'instructions')),
        ...(await resources(staged, 'templates')),
    ];
    for (const file of incoming) {
        destinations.set(file.path, await inspectDestination(root, file.path));
    }
    // Reject unsafe destinations before shared inspection, which treats some
    // invalid leaf types as modified files rather than rejecting them.
    const assets = manifest.files.filter((file) => !file.path.startsWith('libexec/'));
    const inspections = await InstallManifest.inspect(root, { ...manifest, files: assets });
    const statuses = new Map(inspections.map((file) => [file.path, file.status]));
    const incomingPaths = new Set(incoming.map((file) => file.path));
    const candidates: Pick<AssetAction, 'kind' | 'file' | 'source'>[] = [
        ...incoming.map((file) => ({
            kind: 'write' as const,
            file,
            source: join(staged, file.path),
        })),
        ...assets
            .filter((file) => !incomingPaths.has(file.path))
            .map((file) => ({
                kind: 'remove' as const,
                file,
            })),
    ];
    const actions: AssetAction[] = [];
    const absent: string[] = [];
    const conflicts: AssetAction[] = [];
    for (const candidate of candidates) {
        const exists = destinations.get(candidate.file.path) === true;
        const status = statuses.get(candidate.file.path);
        if (candidate.kind === 'remove' && status === 'missing') {
            absent.push(candidate.file.path);
            continue;
        }
        const conflict = exists && status !== 'unchanged';
        const action: AssetAction = { ...candidate, approved: !conflict };
        actions.push(action);
        if (conflict) {
            conflicts.push(action);
        }
    }
    if (conflicts.length && !options.force) {
        throw new Error('Distribution asset conflicts require force');
    }
    if (
        conflicts.length &&
        !options.yes &&
        !options.no &&
        (!options.interactive || !options.confirm)
    ) {
        throw new Error('Distribution conflicts require an interactive confirmation or yes/no');
    }
    const plan: AssetPlan = { root, manifest, actions, absent };
    if (!manifest.files.length && options.runningExecutable) {
        const running = await Deno.realPath(options.runningExecutable);
        const name = running.slice(join(root, 'libexec').length + 1);
        const path = `libexec/${name}`;
        ownedPath(path);
        if (running !== join(root, path)) {
            throw new Error('Bootstrap executable is outside installation');
        }
        const actual = await fingerprint(await regularFile(root, path));
        const expected = await fingerprint(stage.executable);
        if (actual.checksum === expected.checksum && actual.size === expected.size) {
            plan.bootstrap = { path, ...actual };
        }
    }
    // All destinations and ownership are validated before the first prompt.
    for (const action of conflicts) {
        action.approved = options.yes
            ? true
            : options.no
              ? false
              : (await options.confirm?.(action)) === true;
    }
    return plan;
}

export type AssetProgress = { written: string[]; removed: string[]; manifestSaved: boolean };
export class AssetApplyError extends Error {
    constructor(
        public progress: AssetProgress,
        cause: unknown,
    ) {
        super('Distribution asset application failed', { cause });
    }
}
export type AssetIO = {
    write(source: string, destination: string): Promise<void>;
    remove(path: string): Promise<void>;
    save(path: string, manifest: Manifest): Promise<void>;
};
const defaultIO: AssetIO = {
    async write(source, destination): Promise<void> {
        await Deno.mkdir(dirname(destination), { recursive: true });
        await Deno.copyFile(source, destination);
    },
    remove: Deno.remove,
    save: InstallManifest.save,
};

/** Resolves only after ownership persistence succeeds; failures expose progress.
 * A failed action stops further mutations, but successful actions are saved.
 */
export async function applyAssets(
    plan: AssetPlan,
    io: AssetIO = defaultIO,
): Promise<AssetProgress> {
    const progress: AssetProgress = { written: [], removed: [], manifestSaved: false };
    const writtenFiles: ManifestFile[] = [];
    const errors: unknown[] = [];
    try {
        for (const action of plan.actions) {
            // Skipped actions retain their prior baseline, or remain unowned.
            if (!action.approved) {
                continue;
            }
            const destination = join(plan.root, action.file.path);
            await inspectDestination(plan.root, action.file.path);
            if (action.kind === 'write') {
                if (!action.source) {
                    throw new Error('Missing staged source');
                }
                await io.write(action.source, destination);
                writtenFiles.push(action.file);
                progress.written.push(action.file.path);
            } else {
                await io.remove(destination);
                progress.removed.push(action.file.path);
            }
        }
    } catch (error) {
        errors.push(error);
    }
    try {
        await inspectDestination(plan.root, DISTRIBUTION_MANIFEST);
        const removed = new Set([...plan.absent, ...progress.removed]);
        const files = new Map(
            plan.manifest.files
                .filter((file) => !removed.has(file.path))
                .map((file) => [file.path, file]),
        );
        for (const file of writtenFiles) {
            files.set(file.path, file);
        }
        await io.save(join(plan.root, DISTRIBUTION_MANIFEST), {
            version: 1,
            files: [...files.values()],
        });
        progress.manifestSaved = true;
    } catch (error) {
        errors.push(error);
    }
    if (errors.length > 0) {
        const cause = errors.length === 1 ? errors[0] : new AggregateError(errors);
        throw new AssetApplyError(progress, cause);
    }
    return progress;
}
