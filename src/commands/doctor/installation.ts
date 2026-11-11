import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { Harness, type InstallationTarget } from '@harness';
import { InstallManifest, type Manifest } from '@install-manifest';
import { Log } from '@log';
import { Path } from '@path';
import { dirname, fromFileUrl, join } from '@std/path';

import { validate } from '../../install-manifest/validate.ts';
import { launcherTarget } from '../upgrade/activation.ts';
import { DISTRIBUTION_MANIFEST, ownedPath } from '../upgrade/assets.ts';
import { createDoctorReport, type DoctorReport } from './types.ts';

type InstallationSettings = {
    standalone: boolean;
    entryPath: string;
    windows: boolean;
    path: string;
};

/** Resolve installation paths independently of project discovery and configuration. */
async function check(signal: AbortSignal, settings?: InstallationSettings): Promise<DoctorReport> {
    const report = await checkInstructions({ scope: 'global' }, signal);
    const recovery =
        'Restore this installation from a trusted Coderail release or rerun install.sh.';
    async function attempt(
        label: string,
        run: () => Promise<void>,
        manual = recovery,
    ): Promise<boolean> {
        signal.throwIfAborted();
        Log.notice(`Checking ${label}.`);
        try {
            await run();
            signal.throwIfAborted();
            return true;
        } catch (error) {
            signal.throwIfAborted();
            report.failures.push({
                message: `${label}: ${String(error)}`,
                repairable: false,
                manualRepair: [manual],
            });
            return false;
        }
    }

    let root: string | undefined;
    let resolved: InstallationSettings | undefined;
    await attempt('Installation paths', async () => {
        resolved = settings ?? {
            standalone: Deno.build.standalone,
            entryPath: Deno.build.standalone ? Deno.execPath() : fromFileUrl(Deno.mainModule),
            windows: Deno.build.os === 'windows',
            path: '',
        };
        Log.notice(`Resolving installation entry "${resolved.entryPath}".`);
        root = dirname(dirname(await Deno.realPath(resolved.entryPath)));
    });
    if (!root || !resolved) {
        report.skipped.push(
            'Installation resources, manifest, owned files, launcher and PATH: installation paths unavailable.',
        );
        return report;
    }
    const installationRoot = root;
    const location = resolved;
    const resourceRoot = resolved.standalone ? root : join(root, 'assets');
    async function resources(path: string): Promise<void> {
        Log.notice(`Reading installation resource directory "${path}".`);
        for await (const entry of Deno.readDir(path)) {
            const target = join(path, entry.name);
            await attempt(`Resource ${target}`, async () => {
                if (entry.isDirectory) {
                    await resources(target);
                } else if (entry.isFile) {
                    await Deno.readFile(target, { signal });
                } else {
                    throw new Error('Unsupported resource entry type');
                }
            });
        }
    }
    for (const directory of ['instructions', 'templates']) {
        const path = join(resourceRoot, directory);
        await attempt(
            `Resources ${path}`,
            async () => {
                try {
                    await Deno.lstat(path);
                } catch (error) {
                    if (error instanceof Deno.errors.NotFound) {
                        return;
                    }
                    throw error;
                }
                await resources(path);
            },
            `Restore readable repository or distribution resources at "${path}".`,
        );
    }
    if (!resolved.standalone) {
        report.skipped.push(
            'Distribution manifest: source development mode.',
            'Launcher: source development mode.',
            'PATH: source development mode.',
        );
        return report;
    }
    let manifest: Manifest | undefined;
    await attempt('Distribution manifest', async () => {
        const path = join(installationRoot, DISTRIBUTION_MANIFEST);
        Log.notice(`Inspecting distribution manifest "${path}".`);
        const info = await Deno.stat(path);
        signal.throwIfAborted();
        if (!info.isFile) {
            throw new Error('Distribution manifest must be a regular file');
        }
        const loaded: unknown = JSON.parse(await Deno.readTextFile(path, { signal }));
        validate(loaded);
        for (const file of loaded.files) {
            ownedPath(file.path);
        }
        manifest = loaded;
    });
    if (manifest) {
        for (const file of manifest.files) {
            await attempt(`Owned file ${file.path}`, async () => {
                Log.notice(
                    `Inspecting installation owned file "${join(installationRoot, file.path)}".`,
                );
                const results = await InstallManifest.inspect(installationRoot, {
                    version: 1,
                    files: [file],
                });
                for (const result of results) {
                    if (result.status !== 'unchanged') {
                        throw new Error(result.status);
                    }
                }
            });
        }
    } else {
        report.skipped.push('Owned files: distribution manifest unavailable.');
    }
    await attempt('Launcher', async () => {
        Log.notice(`Resolving installation launcher in "${join(installationRoot, 'bin')}".`);
        const target = await launcherTarget(installationRoot, location.windows);
        Log.notice(`Inspecting launcher target "${target ?? 'unavailable'}".`);
        if (!target || dirname(target) !== join(installationRoot, 'libexec')) {
            throw new Error('Missing or broken installation launcher');
        }
        const info = await Deno.lstat(target);
        if (!info.isFile || info.isSymlink) {
            throw new Error('Launcher target is not executable');
        }
        if (!location.windows) {
            await access(target, constants.X_OK);
        }
    });
    const bin = join(installationRoot, 'bin');
    await attempt(
        'PATH',
        () => {
            Log.notice(`Checking installation bin "${bin}" in PATH.`);
            const normalize = (value: string): string => {
                const path = value.replace(/[\\/]+$/, '');
                return location.windows ? path.replaceAll('/', '\\').toLowerCase() : path;
            };
            if (
                !(settings?.path ?? Deno.env.get('PATH') ?? '')
                    .split(location.windows ? ';' : ':')
                    .some((entry) => normalize(entry) === normalize(bin))
            ) {
                throw new Error(`Installation bin "${bin}" is absent from PATH`);
            }
            return Promise.resolve();
        },
        `Add "${bin}" to PATH in your shell configuration and open a new shell.`,
    );
    return report;
}

/** Inspect each target and file independently; installation ownership is the source of truth. */
async function checkInstructions(
    target: InstallationTarget,
    signal: AbortSignal,
): Promise<DoctorReport> {
    const report = createDoctorReport();
    for (const name of Harness.names) {
        signal.throwIfAborted();
        const label = `${target.scope} ${name} instructions`;
        let location = label;
        const manualRepair = [
            'Check the harness home override and file access permissions. Restore a valid instruction manifest; review installed files before removing invalid ownership metadata.',
            `Check access permissions and rerun "cr install${target.scope === 'local' ? ' --local' : ''} --force ${name}"${target.scope === 'local' ? ` from "${target.projectRoot}"` : ''}; review owned file changes before overwriting.`,
        ];
        Log.notice(
            `Resolving ${label}${target.scope === 'local' ? ` in "${target.projectRoot}"` : ''}.`,
        );
        try {
            using connector = Harness.get(name, target);
            if (!connector) {
                throw new Error(`Harness "${name}" is unavailable`);
            }
            const path = join(connector.home, Path.INSTALL_MANIFEST_NAME);
            location = `${label} manifest "${path}"`;
            Log.notice(`Inspecting ${location} (home "${connector.home}").`);
            let manifest: Manifest | null;
            try {
                const info = await Deno.lstat(path);
                signal.throwIfAborted();
                if (!info.isFile) {
                    throw new Error('Instruction manifest must be a regular file');
                }
                manifest = await InstallManifest.load(path);
                signal.throwIfAborted();
            } catch (error) {
                signal.throwIfAborted();
                if (error instanceof Deno.errors.NotFound) {
                    continue;
                }
                throw error;
            }
            if (!manifest) {
                continue;
            }
            for (const file of manifest.files) {
                signal.throwIfAborted();
                Log.notice(`Inspecting ${label} owned file "${join(connector.home, file.path)}".`);
                try {
                    const results = await InstallManifest.inspect(connector.home, {
                        version: 1,
                        files: [file],
                    });
                    signal.throwIfAborted();
                    for (const result of results) {
                        if (result.status !== 'unchanged') {
                            throw new Error(result.status);
                        }
                    }
                } catch (error) {
                    signal.throwIfAborted();
                    report.failures.push({
                        message: `${label} owned file "${join(connector.home, file.path)}": ${String(error)}`,
                        repairable: false,
                        manualRepair,
                    });
                }
            }
        } catch (error) {
            signal.throwIfAborted();
            report.failures.push({
                message: `${location}: ${String(error)}`,
                repairable: false,
                manualRepair,
            });
            report.skipped.push(`${label} owned files: instruction manifest unavailable.`);
        }
    }
    return report;
}

export const Installation = { check, checkInstructions };
