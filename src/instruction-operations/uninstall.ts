import { basename, join } from '@std/path';
import type { HarnessConnector } from '../harness/connector.ts';
import { InstallManifest, type Manifest } from '../install-manifest.ts';
import type { OperationOptions, OperationResult } from '../instruction-operations.ts';
import { homePath, leaf, validatePaths } from './paths.ts';
import { cleanup, planRemovals, removeTracked } from './removal.ts';

export async function uninstall(
    connector: HarnessConnector,
    options: OperationOptions,
): Promise<OperationResult> {
    const result: OperationResult = { outcomes: [] };
    let root: string;
    let manifestName: string;
    let baseline: Manifest;
    let declined: Set<string>;
    try {
        options.signal.throwIfAborted();
        root = await homePath(connector.home, connector.manifestPath);
        manifestName = basename(connector.manifestPath);
        await leaf(root, manifestName);
        const loaded = await InstallManifest.load(join(root, manifestName));
        if (!loaded) return result;
        baseline = loaded;
        validatePaths(baseline.files.map((file) => file.path), manifestName);
        declined = await planRemovals(root, baseline, options);
        options.signal.throwIfAborted();
    } catch (error) {
        options.signal.throwIfAborted();
        return { ...result, error };
    }

    let changed = baseline.files.length === 0;
    const recheck = async (): Promise<void> => {
        if (await homePath(connector.home, connector.manifestPath) !== root) {
            throw new Error('Installation home changed');
        }
        await leaf(root, manifestName);
    };
    const persist = async (): Promise<void> => {
        if (!changed) return;
        await recheck();
        if (baseline.files.length) {
            await InstallManifest.save(join(root, manifestName), baseline);
        } else if (await leaf(root, manifestName)) {
            await Deno.remove(join(root, manifestName));
        }
    };
    const deleted: string[] = [];
    try {
        for (const file of [...baseline.files]) {
            options.signal.throwIfAborted();
            await recheck();
            const outcome = await removeTracked(root, file.path, declined);
            baseline.files = baseline.files.filter((entry) => entry.path !== file.path);
            changed = true;
            result.outcomes.push(outcome);
            if (outcome.status === 'removed') deleted.push(file.path);
        }
        await recheck();
        await cleanup(root, deleted, options);
        options.signal.throwIfAborted();
        await persist();
    } catch (error) {
        result.error = new Error('Uninstallation failed; no rollback performed', { cause: error });
        try {
            await persist();
        } catch (persistenceError) {
            result.error = new AggregateError(
                [result.error, persistenceError],
                'Uninstallation and baseline persistence failed; no rollback performed',
            );
        }
        options.signal.throwIfAborted();
    }
    return result;
}
