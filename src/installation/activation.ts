import type { ManifestFile } from '@install-manifest';
import { canonicalRoot, fingerprint, regularFile } from '@install-manifest';
import { basename, join, resolve } from '@std/path';

import {
    applyAssets,
    type AssetIO,
    type AssetOptions,
    type AssetPlan,
    type AssetProgress,
    planAssets,
} from './assets.ts';
import { type StagedDistribution, targetTriple } from './distribution.ts';

/** Cleanup must use this same lock and re-read ownership inside its callback.
 * A crashed process leaves a lock directory: manual recovery must first establish
 * that no installation operation is running. Never steal a possibly live lock.
 */
export async function withInstallationLock<T>(
    installation: string,
    run: (root: string) => Promise<T>,
): Promise<T> {
    const root = await canonicalRoot(installation);
    const lock = join(root, '.coderail-upgrade.lock');
    try {
        await Deno.mkdir(lock);
    } catch (error) {
        if (error instanceof Deno.errors.AlreadyExists) {
            throw new Error(
                'Installation busy; check running upgrades before removing stale lock',
                {
                    cause: error,
                },
            );
        }
        throw error;
    }
    try {
        return await run(root);
    } finally {
        await Deno.remove(lock);
    }
}

async function inspectExecutableDirectory(path: string, create = true): Promise<void> {
    if (create) {
        try {
            await Deno.mkdir(path);
        } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
                throw error;
            }
        }
    }
    let info: Deno.FileInfo;
    try {
        info = await Deno.lstat(path);
    } catch (error) {
        if (!create && error instanceof Deno.errors.NotFound) {
            return;
        }
        throw error;
    }
    if (info.isSymlink || !info.isDirectory) {
        throw new Error('Unsafe executable directory');
    }
}

export function windowsLauncher(name: string): string {
    if (!/^cr-[A-Za-z0-9_.-]+\.exe$/.test(name)) {
        throw new Error('Unsafe launcher executable');
    }
    return `@echo off\r\n"%~dp0..\\libexec\\${name}" %*\r\nexit /b %errorlevel%\r\n`;
}

export async function launcherTarget(root: string, windows: boolean): Promise<string | undefined> {
    const path = join(root, 'bin', windows ? 'cr.cmd' : 'cr');
    let info: Deno.FileInfo;
    try {
        info = await Deno.lstat(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return undefined;
        }
        throw error;
    }
    if (!windows && info.isSymlink) {
        return resolve(root, 'bin', await Deno.readLink(path));
    }
    if (windows && info.isFile && !info.isSymlink) {
        const text = await Deno.readTextFile(path);
        const name = text.match(/libexec\\(cr-[A-Za-z0-9_.-]+\.exe)"/)?.[1];
        if (name && text === windowsLauncher(name)) {
            return join(root, 'libexec', name);
        }
    }
    throw new Error('Unsafe existing launcher');
}

export type ActivationResult = {
    activated: true;
    runningExecutable?: string;
    currentLauncherTarget?: string;
    selectedExecutable: string;
    ownedExecutables: ManifestFile[];
    protectedExecutables: string[];
    retiredExecutables: string[];
};

export class ActivationError extends Error {
    constructor(
        public progress: AssetProgress,
        cause: unknown,
    ) {
        super(`Distribution activation failed: ${String(cause)}`, { cause });
    }
}

/** Coordinates reconciliation and activation. Cleanup is a separate later step;
 * errors can leave reconciled assets or a staged binary, never imply rollback.
 */
export async function activateDistribution(
    installation: string,
    stage: StagedDistribution,
    options: AssetOptions & {
        beforeMutation?: (root: string, plan: AssetPlan) => Promise<void>;
    } = {},
    assetIO?: AssetIO,
): Promise<ActivationResult> {
    if (stage.build.target !== targetTriple(Deno.build.os, Deno.build.arch)) {
        throw new Error('Executable target does not match this host');
    }
    if (
        !/^(canary|[0-9]+\.[0-9]+\.[0-9]+)$/.test(stage.build.version) ||
        !/^[0-9a-f]{40}$/.test(stage.build.commit)
    ) {
        throw new Error('Invalid executable identity');
    }
    return await withInstallationLock(installation, async (root) => {
        const windows = Deno.build.os === 'windows';
        await inspectExecutableDirectory(join(root, 'bin'), false);
        await inspectExecutableDirectory(join(root, 'libexec'), false);
        const currentLauncherTarget = await launcherTarget(root, windows);
        const runningExecutable = await Deno.realPath(options.runningExecutable ?? Deno.execPath());
        // Bootstrap claiming is only meaningful for binaries inside this root.
        const bootstrap =
            runningExecutable &&
            runningExecutable === join(root, 'libexec', basename(runningExecutable));
        const plan = await planAssets(root, stage, {
            ...options,
            runningExecutable: bootstrap ? runningExecutable : undefined,
        });
        await options.beforeMutation?.(root, plan);
        await inspectExecutableDirectory(join(root, 'bin'));
        await inspectExecutableDirectory(join(root, 'libexec'));
        const expected = await fingerprint(stage.executable);
        const identity =
            stage.build.version === 'canary' ? `canary-${stage.build.commit}` : stage.build.version;
        const stem = `cr-${identity}`;
        const suffix = windows ? '.exe' : '';
        let selected: ManifestFile | undefined;
        for (const file of [...plan.manifest.files, ...(plan.bootstrap ? [plan.bootstrap] : [])]) {
            if (!file.path.startsWith(`libexec/${stem}`)) {
                continue;
            }
            if (
                !new RegExp(
                    `^libexec/${stem.replaceAll('.', '\\.')}(-[0-9a-f-]+)?${
                        windows ? '\\.exe' : ''
                    }$`,
                ).test(file.path)
            ) {
                continue;
            }
            try {
                const actual = await fingerprint(await regularFile(root, file.path));
                if (
                    actual.checksum === expected.checksum &&
                    actual.size === expected.size &&
                    file.checksum === actual.checksum &&
                    file.size === actual.size
                ) {
                    selected = file;
                }
            } catch (error) {
                if (!(error instanceof Deno.errors.NotFound)) {
                    throw error;
                }
            }
            if (selected) {
                break;
            }
        }
        if (!selected) {
            let name = `${stem}${suffix}`;
            while (true) {
                let destination: Deno.FsFile;
                try {
                    destination = await Deno.open(join(root, 'libexec', name), {
                        write: true,
                        createNew: true,
                        mode: 0o755,
                    });
                } catch (error) {
                    if (!(error instanceof Deno.errors.AlreadyExists)) {
                        throw error;
                    }
                    name = `${stem}-${crypto.randomUUID()}${suffix}`;
                    continue;
                }
                try {
                    const source = await Deno.open(stage.executable);
                    try {
                        await source.readable.pipeTo(destination.writable);
                    } finally {
                        try {
                            source.close();
                        } catch {
                            /* pipe closes streams */
                        }
                    }
                } catch (error) {
                    try {
                        destination.close();
                    } catch {
                        /* pipe may have closed it */
                    }
                    await Deno.remove(join(root, 'libexec', name));
                    throw error;
                }
                selected = { path: `libexec/${name}`, ...expected };
                const actual = await fingerprint(await regularFile(root, selected.path));
                if (actual.checksum !== expected.checksum || actual.size !== expected.size) {
                    throw new Error('Staged executable changed');
                }
                break;
            }
        }
        const selectedExecutable = join(root, selected.path);
        // Persist executable ownership in the same manifest as asset changes.
        plan.manifest.files = plan.manifest.files.filter((file) => file.path !== selected.path);
        plan.manifest.files.push(selected);
        const progress = await applyAssets(plan, assetIO);
        try {
            const temporary = join(root, 'bin', `.cr-${crypto.randomUUID()}`);
            try {
                if (windows) {
                    await Deno.writeTextFile(
                        temporary,
                        windowsLauncher(basename(selectedExecutable)),
                        {
                            createNew: true,
                        },
                    );
                } else {
                    await Deno.symlink(selectedExecutable, temporary);
                }
                await Deno.rename(temporary, join(root, 'bin', windows ? 'cr.cmd' : 'cr'));
            } finally {
                await removeIfExists(temporary);
            }
            const protectedExecutables = [
                ...new Set(
                    [runningExecutable, currentLauncherTarget, selectedExecutable].filter(
                        (path): path is string => path !== undefined,
                    ),
                ),
            ];
            const ownedExecutables = plan.manifest.files.filter((file) =>
                file.path.startsWith('libexec/'),
            );
            return {
                activated: true,
                runningExecutable,
                currentLauncherTarget,
                selectedExecutable,
                ownedExecutables,
                protectedExecutables,
                retiredExecutables: ownedExecutables
                    .map((file) => join(root, file.path))
                    .filter((path) => !protectedExecutables.includes(path)),
            };
        } catch (cause) {
            throw new ActivationError(progress, cause);
        }
    });
}

async function removeIfExists(path: string): Promise<void> {
    try {
        await Deno.remove(path);
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
}
