import { Conf, type ConfigDocument } from '@conf';
import { Fs } from '@fs';
import { join, resolve } from '@std/path';

import { get } from './catalog.ts';
import { run, select } from './startup.ts';

export type ApplyOptions = {
    installRoot: string;
    projectRoot: string;
    names: readonly string[];
    mode: 'preview' | 'apply';
    overwrite: 'error' | ((path: string) => Promise<boolean>);
    signal: AbortSignal;
};
export type TemplateAction = {
    kind: 'copy' | 'merge-config' | 'startup' | 'skip' | 'conflict';
    path: string;
    details?: string;
};
export type TemplateReport = { actions: TemplateAction[]; conflicts: string[] };

type Asset = {
    source: string;
    target: string;
    directory: boolean;
    exists: boolean;
    conflict: boolean;
};

async function stat(path: string): Promise<Deno.FileInfo | undefined> {
    try {
        return await Deno.lstat(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return undefined;
        }
        throw error;
    }
}

async function document(
    path: string,
    signal: AbortSignal,
    files?: Map<string, Uint8Array | null>,
): Promise<ConfigDocument> {
    const content = files?.get(path) ?? (await Deno.readFile(path, { signal }));
    const parsed = await Conf.parse(new Blob([new Uint8Array(content)]).stream());
    Conf.validateConfiguration(parsed);
    return { values: parsed.toObject(), comments: parsed.getComments() };
}

async function preflight(
    source: string,
    target: string,
    signal: AbortSignal,
    assets: Asset[],
    files?: Map<string, Uint8Array | null>,
): Promise<void> {
    signal.throwIfAborted();
    const entries = await Array.fromAsync(Deno.readDir(source));
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        signal.throwIfAborted();
        const from = join(source, entry.name);
        const to = join(target, entry.name);
        // Links and special files could escape the project or redirect later writes.
        if (!entry.isFile && !entry.isDirectory) {
            throw new Error(`Unsupported template asset "${from}".`);
        }
        const planned = files?.get(to);
        const existing =
            planned === undefined
                ? await stat(to)
                : {
                      isFile: planned !== null,
                      isDirectory: planned === null,
                  };
        let conflict = false;
        if (existing) {
            let identical = false;
            if (entry.isFile && existing.isFile) {
                const [left, right] = await Promise.all([
                    Deno.readFile(from, { signal }),
                    planned ?? Deno.readFile(to, { signal }),
                ]);
                identical =
                    left.length === right.length && left.every((byte, i) => byte === right[i]);
            }
            conflict = entry.isFile && existing.isFile && !identical;
            if (!(entry.isDirectory && existing.isDirectory) && !identical && !conflict) {
                if (files) {
                    conflict = true;
                } else {
                    throw new Error(`Template asset conflict at "${to}".`);
                }
            }
        }
        assets.push({
            source: from,
            target: to,
            directory: entry.isDirectory,
            exists: !!existing,
            conflict,
        });
        if (entry.isDirectory && !conflict) {
            await preflight(from, to, signal, assets, files);
        }
    }
}

/** Applies each template only after its settings and complete asset tree pass preflight. */
export async function apply(
    options: ApplyOptions,
    previewFiles = new Map<string, Uint8Array | null>(),
): Promise<TemplateReport> {
    const { installRoot, names, signal } = options;
    signal.throwIfAborted();
    const files = options.mode === 'preview' ? previewFiles : undefined;
    const projectRoot = resolve(options.projectRoot);
    const configPath = join(projectRoot, '.coderail', 'config');
    const report: TemplateReport = { actions: [], conflicts: [] };
    for (const name of names) {
        try {
            signal.throwIfAborted();
            const info = await get(installRoot, name, signal);
            const template = await document(join(info.path, 'config'), signal);
            const project = await document(configPath, signal, files);
            const merged = Conf.stringify(Conf.merge([project, template]));
            const assets: Asset[] = [];
            await preflight(join(info.path, 'assets'), projectRoot, signal, assets, files);
            const startup = await select(info.path, Deno.build.os, signal);
            for (const asset of assets) {
                if (asset.conflict && !files) {
                    if (options.overwrite === 'error') {
                        throw new Error(`Template asset conflict at "${asset.target}".`);
                    }
                    signal.throwIfAborted();
                    asset.exists = !(await options.overwrite(asset.target));
                    signal.throwIfAborted();
                }
            }
            for (const asset of assets) {
                signal.throwIfAborted();
                if (files) {
                    if (asset.conflict) {
                        report.conflicts.push(asset.target);
                    } else if (!asset.exists) {
                        files.set(
                            asset.target,
                            asset.directory ? null : await Deno.readFile(asset.source, { signal }),
                        );
                    }
                } else if (!asset.exists) {
                    if (asset.directory) {
                        await Deno.mkdir(asset.target);
                    } else {
                        await Deno.copyFile(asset.source, asset.target);
                    }
                }
                report.actions.push({
                    kind: files && asset.conflict ? 'conflict' : asset.exists ? 'skip' : 'copy',
                    path: asset.target,
                });
            }
            signal.throwIfAborted();
            if (files) {
                files.set(configPath, new TextEncoder().encode(merged));
            } else {
                await Fs.write(configPath, new Blob([merged]).stream());
            }
            report.actions.push({ kind: 'merge-config', path: configPath, details: name });
            if (startup) {
                if (!files) {
                    await run(startup, projectRoot, signal);
                }
                report.actions.push({ kind: 'startup', path: startup, details: name });
            }
        } catch (error) {
            throw new Error(`Cannot apply template "${name}" to "${projectRoot}".`, {
                cause: error,
            });
        }
    }
    return report;
}
