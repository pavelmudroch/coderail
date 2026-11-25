import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { Harness, type InstallationTarget } from '@harness';
import { InstallManifest, type Manifest } from '@install-manifest';
import { DISTRIBUTION_MANIFEST, launcherTarget, ownedPath } from '@installation';
import { Log } from '@log';
import { Path } from '@path';
import { dirname, fromFileUrl, join, relative } from '@std/path';

import { instructionName, Instructions } from './instructions.ts';
import { createDoctorReport, type DoctorFailure, type DoctorReport } from './types.ts';

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
        message: string,
        details: NonNullable<DoctorFailure['details']>,
        run: () => Promise<void>,
        manual = recovery,
    ): Promise<void> {
        signal.throwIfAborted();
        Log.notice(
            `Checking ${message.toLowerCase()}${details.map(({ value }) => ` "${value}"`).join('')}.`,
        );
        try {
            await run();
            signal.throwIfAborted();
        } catch (error) {
            signal.throwIfAborted();
            report.failures.push({
                message,
                details: [...details, { label: 'Error', value: String(error) }],
                repairable: false,
                manualRepair: [manual],
            });
        }
    }

    let root: string | undefined;
    let resolved: InstallationSettings | undefined;
    const entryDetails: { label: string; value: string }[] = [];
    await attempt('Installation paths unavailable', entryDetails, async () => {
        resolved = settings ?? {
            standalone: Deno.build.standalone,
            entryPath: Deno.build.standalone ? Deno.execPath() : fromFileUrl(Deno.mainModule),
            windows: Deno.build.os === 'windows',
            path: '',
        };
        entryDetails.push({ label: 'Entry', value: resolved.entryPath });
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
            await attempt(
                'Installation resource unavailable',
                [{ label: 'Path', value: target }],
                async () => {
                    if (entry.isDirectory) {
                        await resources(target);
                    } else if (entry.isFile) {
                        await Deno.readFile(target, { signal });
                    } else {
                        throw new Error('Unsupported resource entry type');
                    }
                },
            );
        }
    }
    for (const directory of ['instructions', 'templates']) {
        const path = join(resourceRoot, directory);
        await attempt(
            'Installation resources unavailable',
            [{ label: 'Directory', value: path }],
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
    const instructions = await Instructions.checkAssets(resourceRoot, signal);
    report.failures.push(...instructions.failures);
    if (!resolved.standalone) {
        report.skipped.push({
            reason: 'source development mode',
            checks: ['distribution manifest', 'launcher', 'PATH'],
        });
        return report;
    }
    let manifest: Manifest | undefined;
    const manifestPath = join(installationRoot, DISTRIBUTION_MANIFEST);
    await attempt(
        'Distribution manifest unavailable or invalid',
        [{ label: 'File', value: manifestPath }],
        async () => {
            Log.notice(`Inspecting distribution manifest "${manifestPath}".`);
            const info = await Deno.stat(manifestPath);
            signal.throwIfAborted();
            if (!info.isFile) {
                throw new Error('Distribution manifest must be a regular file');
            }
            const loaded: unknown = JSON.parse(await Deno.readTextFile(manifestPath, { signal }));
            InstallManifest.validate(loaded);
            for (const file of loaded.files) {
                ownedPath(file.path);
            }
            manifest = loaded;
        },
    );
    if (manifest) {
        for (const file of manifest.files) {
            // Asset Markdown is checked above; still diagnose missing manifest-owned candidates.
            const expected = file.path.startsWith('instructions/')
                ? instructionName(file.path)
                : undefined;
            if (expected !== undefined) {
                const path = join(installationRoot, file.path);
                const result = await Instructions.checkFile(path, expected, signal);
                for (const failure of result.failures) {
                    if (
                        !report.failures.some(
                            (existing) =>
                                existing.message === failure.message &&
                                existing.details?.some(
                                    ({ label, value }) => label === 'File' && value === path,
                                ),
                        )
                    ) {
                        report.failures.push(failure);
                    }
                }
                continue;
            }
            const path = join(installationRoot, file.path);
            await attempt(
                'Distribution owned file differs from manifest',
                [{ label: 'File', value: path }],
                async () => {
                    Log.notice(`Inspecting installation owned file "${path}".`);
                    const results = await InstallManifest.inspect(installationRoot, {
                        version: 1,
                        files: [file],
                    });
                    for (const result of results) {
                        if (result.status !== 'unchanged') {
                            throw new Error(result.status);
                        }
                    }
                },
            );
        }
    } else {
        report.skipped.push('Owned files: distribution manifest unavailable.');
    }
    const bin = join(installationRoot, 'bin');
    const libexec = join(installationRoot, 'libexec');
    const launcherDetails = [
        { label: 'Launcher directory', value: bin },
        { label: 'Expected target directory', value: libexec },
    ];
    await attempt('Installation launcher unavailable', launcherDetails, async () => {
        Log.notice(`Resolving installation launcher in "${bin}".`);
        const target = await launcherTarget(installationRoot, location.windows);
        Log.notice(`Inspecting launcher target "${target ?? 'unavailable'}".`);
        if (target) {
            launcherDetails.push({ label: 'Target', value: target });
        }
        if (!target || dirname(target) !== libexec) {
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
    await attempt(
        'Installation bin missing from PATH',
        [{ label: 'Expected PATH entry', value: bin }],
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
                throw new Error('Expected entry is absent from PATH');
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
    const display = (path: string): string =>
        target.scope === 'local' ? relative(target.projectRoot, path) : path;
    for (const name of Harness.names) {
        signal.throwIfAborted();
        const label = `${target.scope} ${name} instructions`;
        const context = [
            { label: 'Scope', value: target.scope },
            { label: 'Harness', value: name },
        ];
        let manifestPath: string | undefined;
        const manualRepair = [
            'Check the harness home override and file access permissions. Restore a valid instruction manifest; review installed files before removing invalid ownership metadata.',
            `Check access permissions and rerun "cr install${target.scope === 'local' ? ' --local' : ''} --force ${name}"${target.scope === 'local' ? ` from the project root` : ''}; review owned file changes before overwriting.`,
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
            manifestPath = path;
            Log.notice(`Inspecting ${label} manifest "${path}" (home "${connector.home}").`);
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
                const owned = join(connector.home, file.path);
                Log.notice(`Inspecting ${label} owned file "${owned}".`);
                try {
                    // Inspect first to retain manifest path/type and ancestor validation.
                    const results = await InstallManifest.inspect(connector.home, {
                        version: 1,
                        files: [file],
                    });
                    signal.throwIfAborted();
                    const expected = instructionName(file.path);
                    if (expected !== undefined) {
                        const result = await Instructions.checkFile(
                            owned,
                            expected,
                            signal,
                            display(owned),
                            context,
                        );
                        report.failures.push(...result.failures);
                        continue;
                    }
                    for (const result of results) {
                        if (result.status !== 'unchanged') {
                            throw new Error(result.status);
                        }
                    }
                } catch (error) {
                    signal.throwIfAborted();
                    report.failures.push({
                        message: 'Installed instruction file differs from manifest',
                        details: [
                            ...context,
                            { label: 'File', value: display(owned) },
                            { label: 'Error', value: String(error) },
                        ],
                        repairable: false,
                        manualRepair,
                    });
                }
            }
        } catch (error) {
            signal.throwIfAborted();
            report.failures.push({
                message:
                    manifestPath === undefined
                        ? 'Harness instruction location unavailable'
                        : 'Instruction manifest unavailable or invalid',
                details: [
                    ...context,
                    ...(manifestPath === undefined
                        ? []
                        : [{ label: 'File', value: display(manifestPath) }]),
                    { label: 'Error', value: String(error) },
                ],
                repairable: false,
                manualRepair,
            });
            report.skipped.push(`${label} owned files: instruction manifest unavailable.`);
        }
    }
    return report;
}

export const Installation = { check, checkInstructions };
