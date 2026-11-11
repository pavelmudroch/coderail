import { InstallManifest, type Manifest } from '@install-manifest';
import { dirname, fromFileUrl, join } from '@std/path';

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
    const report = createDoctorReport();
    const recovery =
        'Restore this installation from a trusted Coderail release or rerun install.sh.';
    async function attempt(
        label: string,
        run: () => Promise<void>,
        manual = recovery,
    ): Promise<boolean> {
        signal.throwIfAborted();
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
        for await (const entry of Deno.readDir(path)) {
            const target = join(path, entry.name);
            await attempt(`Resource ${target}`, async () => {
                if (entry.isDirectory) {
                    await resources(target);
                } else {
                    await Deno.readFile(target, { signal });
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
        const loaded = await InstallManifest.load(join(installationRoot, DISTRIBUTION_MANIFEST));
        if (loaded === null) {
            throw new Error('Missing distribution manifest');
        }
        for (const file of loaded.files) {
            ownedPath(file.path);
        }
        manifest = loaded;
    });
    if (manifest) {
        for (const file of manifest.files) {
            await attempt(`Owned file ${file.path}`, async () => {
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
        const target = await launcherTarget(installationRoot, location.windows);
        if (!target || dirname(target) !== join(installationRoot, 'libexec')) {
            throw new Error('Missing or broken installation launcher');
        }
        const info = await Deno.lstat(target);
        if (
            !info.isFile ||
            info.isSymlink ||
            (!location.windows && info.mode !== null && (info.mode & 0o111) === 0)
        ) {
            throw new Error('Launcher target is not executable');
        }
    });
    const bin = join(installationRoot, 'bin');
    await attempt(
        'PATH',
        () => {
            const normalize = (value: string): string => {
                const trimmed = value.trim().replace(/[\\/]+$/, '');
                return location.windows ? trimmed.replaceAll('/', '\\').toLowerCase() : trimmed;
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

export const Installation = { check };
