import { Fs } from '@fs';
import { basename, dirname, join } from '@std/path';
import type { ConnectorFile, HarnessConnector } from '../harness/connector.ts';
import { InstallManifest, type Manifest } from '../install-manifest.ts';
import type { OperationOptions, OperationResult } from '../instruction-operations.ts';
import { Confirmation } from './confirmation.ts';
import { homePath, leaf, stat, validatePaths } from './paths.ts';
import { prepare } from './prepare.ts';
import { cleanup, planRemovals, removeTracked } from './removal.ts';

export async function install(
    connector: HarnessConnector,
    bundleRoot: string,
    options: OperationOptions,
): Promise<OperationResult> {
    const result: OperationResult = { outcomes: [] };
    let root: string;
    let manifestName: string;
    let baseline: Manifest;
    let outputs: ConnectorFile[];
    let obsolete: Manifest;
    let declinedRemovals: Set<string>;
    const declined = new Set<string>();
    try {
        options.signal.throwIfAborted();
        outputs = await prepare(connector, bundleRoot);
        options.signal.throwIfAborted();
        root = await homePath(connector.home, connector.manifestPath);
        manifestName = basename(connector.manifestPath);
        validatePaths(outputs.map((file) => file.path), manifestName);
        for (const output of outputs) {
            if (!(output.content instanceof Uint8Array)) throw new Error('Invalid output bytes');
        }
        await leaf(root, manifestName);
        baseline = await InstallManifest.load(join(root, manifestName)) ??
            { version: 1, files: [] };
        validatePaths(baseline.files.map((file) => file.path), manifestName);
        // Desired and tracked entries may overlap, but may not be ancestors of each other.
        const paths = [
            ...new Set([
                ...outputs.map((file) => file.path),
                ...baseline.files.map((file) => file.path),
            ]),
        ];
        validatePaths(paths, manifestName);
        const exists = new Set<string>();
        for (const path of paths) if (await leaf(root, path)) exists.add(path);
        const inspections = await stat(root) ? await InstallManifest.inspect(root, baseline) : [];
        const desired = new Set(outputs.map((file) => file.path));
        obsolete = {
            version: 1,
            files: baseline.files.filter((file) => !desired.has(file.path)),
        };
        const tracked = new Set(baseline.files.map((file) => file.path));
        const modified = new Set(
            inspections.filter((file) => file.status === 'modified')
                .map((file) => file.path),
        );
        const protectedPaths = outputs.filter((file) =>
            modified.has(file.path) || (exists.has(file.path) && !tracked.has(file.path))
        ).map((file) => file.path);
        if (!options.force && (protectedPaths.length || modified.size)) {
            throw new Error('Protected installed files require force');
        }
        if (protectedPaths.length && options.confirmation === 'prompt') {
            if (options.nonInteractive || !Confirmation.available()) {
                throw new Error('Confirmation requires an interactive terminal');
            }
        }
        for (const path of protectedPaths) {
            options.signal.throwIfAborted();
            const approved = options.confirmation === 'yes' ||
                (options.confirmation === 'prompt' && await Confirmation.ask(path));
            if (!approved) declined.add(path);
        }
        declinedRemovals = obsolete.files.length
            ? await planRemovals(root, obsolete, options)
            : new Set<string>();
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
    try {
        for (const output of outputs) {
            options.signal.throwIfAborted();
            if (declined.has(output.path)) {
                result.outcomes.push({ path: output.path, status: 'skipped' });
                continue;
            }
            await recheck();
            await leaf(root, output.path);
            await Deno.mkdir(dirname(join(root, output.path)), { recursive: true });
            await leaf(root, output.path);
            await Fs.write(
                join(root, output.path),
                new ReadableStream<Uint8Array>({
                    start(controller): void {
                        controller.enqueue(output.content);
                        controller.close();
                    },
                }),
            );
            changed = true;
            // A capture failure can leave changed bytes without a matching saved baseline.
            const captured = await InstallManifest.capture(root, [output.path]);
            const record = captured.files[0];
            if (!record) throw new Error(`Missing captured baseline: ${output.path}`);
            const index = baseline.files.findIndex((file) => file.path === output.path);
            if (index < 0) baseline.files.push(record);
            else baseline.files[index] = record;
            result.outcomes.push({ path: output.path, status: 'installed' });
        }
        const deleted: string[] = [];
        for (const file of obsolete.files) {
            options.signal.throwIfAborted();
            await recheck();
            const outcome = await removeTracked(root, file.path, declinedRemovals);
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
        result.error = new Error('Installation failed; changed bytes may lack a saved baseline', {
            cause: error,
        });
        try {
            await persist();
        } catch (persistenceError) {
            result.error = new AggregateError(
                [result.error, persistenceError],
                'Installation and baseline persistence failed; no rollback performed',
            );
        }
        options.signal.throwIfAborted();
    }
    return result;
}
