import { dirname, join } from '@std/path';
import { InstallManifest, type Manifest } from '../install-manifest.ts';
import type { FileOutcome, OperationOptions } from '../instruction-operations.ts';
import { Confirmation } from './confirmation.ts';
import { directoryPath, leaf } from './paths.ts';

/** Resolve every protected removal before changing any files. Paths must already be validated. */
export async function planRemovals(
    root: string,
    baseline: Manifest,
    options: OperationOptions,
): Promise<Set<string>> {
    for (const file of baseline.files) await leaf(root, file.path);
    const inspections = await InstallManifest.inspect(root, baseline);
    const modified = inspections.filter((file) => file.status === 'modified');
    if (modified.length && !options.force) {
        throw new Error('Protected installed files require force');
    }
    if (modified.length && options.confirmation === 'prompt') {
        if (options.nonInteractive || !Confirmation.available()) {
            throw new Error('Confirmation requires an interactive terminal');
        }
    }
    const declined = new Set<string>();
    for (const file of modified) {
        options.signal.throwIfAborted();
        const approved = options.confirmation === 'yes' ||
            (options.confirmation === 'prompt' && await Confirmation.ask(file.path, 'Remove'));
        if (!approved) declined.add(file.path);
    }
    return declined;
}

/** Caller drops ownership only after this action succeeds. */
export async function removeTracked(
    root: string,
    path: string,
    declined: Set<string>,
): Promise<FileOutcome> {
    if (!await leaf(root, path)) return { path, status: 'already-missing' };
    if (declined.has(path)) return { path, status: 'skipped' };
    await Deno.remove(join(root, path));
    return { path, status: 'removed' };
}

/** Only successful tracked deletions can seed cleanup; home is never a candidate. */
export async function cleanup(
    root: string,
    deleted: string[],
    options: OperationOptions,
): Promise<void> {
    const directories = new Set<string>();
    for (const path of deleted) {
        let parent = dirname(path);
        while (parent !== '.') {
            directories.add(parent);
            parent = dirname(parent);
        }
    }
    const blocked: string[] = [];
    const ordered = [...directories].sort((a, b) => b.split('/').length - a.split('/').length);
    for (const path of ordered) {
        options.signal.throwIfAborted();
        if (blocked.some((child) => child === path || child.startsWith(`${path}/`))) continue;
        const info = await Deno.lstat(root);
        if (!info.isDirectory || info.isSymlink) throw new Error('Unsafe cleanup home');
        await directoryPath(root, path.split('/'));
        let nonempty = false;
        for await (const _entry of Deno.readDir(join(root, path))) {
            nonempty = true;
            break;
        }
        if (nonempty) {
            blocked.push(path);
            continue;
        }
        await directoryPath(root, path.split('/'));
        await Deno.remove(join(root, path));
    }
}
