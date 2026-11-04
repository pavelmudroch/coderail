import { join } from '@std/path';

import { InstallManifest } from '../../install-manifest.ts';
import { fingerprint, regularFile } from '../../install-manifest/capture.ts';
import { type ActivationResult, launcherTarget, withInstallationLock } from './activation.ts';
import { DISTRIBUTION_MANIFEST } from './assets.ts';

function reportResidual(path: string, error: unknown): void {
    console.error(`Retained executable cleanup state: ${path}`, error);
}

export type CleanupOptions = {
    runningExecutable?: string;
    selectedExecutable?: string;
    report?: (path: string, error: unknown) => void;
    remove?: (path: string) => Promise<void>;
};

/** Invoke only after validation/confirmation, before planning asset mutations.
 * The lock excludes activation and deferred helpers; ownership is always reloaded.
 */
export async function cleanupStaleExecutables(
    installation: string,
    options: CleanupOptions = {},
): Promise<string[]> {
    return await withInstallationLock(installation, async (root) => {
        return await cleanupStaleExecutablesWithinLock(root, options);
    });
}

/** Caller must hold withInstallationLock through preflight, cleanup and activation. */
export async function cleanupStaleExecutablesWithinLock(
    root: string,
    options: CleanupOptions = {},
): Promise<string[]> {
    const runningExecutable = await Deno.realPath(options.runningExecutable ?? Deno.execPath());
    const currentLauncherTarget = await launcherTarget(root, Deno.build.os === 'windows');
    return await removeOwnedExecutables(
        root,
        [runningExecutable, currentLauncherTarget, options.selectedExecutable],
        options,
    );
}

async function removeOwnedExecutables(
    root: string,
    protectedPaths: (string | undefined)[],
    options: CleanupOptions,
): Promise<string[]> {
    const manifestPath = join(root, DISTRIBUTION_MANIFEST);
    try {
        await regularFile(root, DISTRIBUTION_MANIFEST);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return [];
        }
        throw error;
    }
    const manifest = await InstallManifest.load(manifestPath);
    if (!manifest) {
        return [];
    }
    const removed: string[] = [];
    for (const file of [...manifest.files]) {
        if (!/^libexec\/cr-[A-Za-z0-9_.-]+$/.test(file.path)) {
            continue;
        }
        const path = join(root, file.path);
        if (protectedPaths.includes(path)) {
            continue;
        }
        try {
            const actual = await fingerprint(await regularFile(root, file.path));
            if (actual.checksum !== file.checksum || actual.size !== file.size) {
                continue;
            }
            await (options.remove ?? Deno.remove)(path);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                (options.report ?? reportResidual)(path, error);
                continue;
            }
        }
        manifest.files = manifest.files.filter((item) => item.path !== file.path);
        removed.push(path);
    }
    // Missing records left by a deferred helper are reconciled here too.
    if (removed.length > 0) {
        await InstallManifest.save(manifestPath, manifest);
    }
    return removed;
}

export type DeferredLauncher = (script: string) => Promise<void>;

/** No script files or copied executables are needed. The helper retains ownership
 * records for the next mutation to reconcile, including on deletion failure.
 */
export function deferredCleanupScript(root: string, pid: number, candidates: string[]): string {
    const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
    return String.raw`
$ErrorActionPreference = 'Stop'
Wait-Process -Id ${pid} -ErrorAction SilentlyContinue
$root = ${quote(root)}
$lock = Join-Path $root '.coderail-upgrade.lock'
try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null } catch { exit }
try {
    $lib = Join-Path $root 'libexec'
    $manifestPath = Join-Path $root '${DISTRIBUTION_MANIFEST}'
    $bin = Join-Path $root 'bin'
    $launcher = Join-Path $bin 'cr.cmd'
    foreach ($p in @($lib, $manifestPath, $bin, $launcher)) {
        if ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit }
    }
    $text = [IO.File]::ReadAllText($launcher)
    if ($text -notmatch '^@echo off\r\n"%~dp0\.\.\\libexec\\(cr-[A-Za-z0-9_.-]+\.exe)" %\*\r\nexit /b %errorlevel%\r\n$') { exit }
    $current = $Matches[1]
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.version -ne 1) { exit }
    $candidates = @(${candidates.map(quote).join(',')})
    foreach ($file in $manifest.files) {
        if ($file.path -notmatch '^libexec/(cr-[A-Za-z0-9_.-]+)$') { continue }
        $name = $Matches[1]
        if ($name -eq $current -or $candidates -cnotcontains $file.path) { continue }
        $path = Join-Path $lib $name
        try {
            $item = Get-Item -LiteralPath $path
            if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
            if ($item.Length -ne $file.size) { continue }
            if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.checksum) { continue }
            Remove-Item -LiteralPath $path -ErrorAction Stop
        } catch { [Console]::Error.WriteLine("Retained executable: $path : $_") }
    }
} finally { Remove-Item -LiteralPath $lock }
`;
}

function launchDeferred(script: string): Promise<void> {
    // PowerShell's encoded command is UTF-16LE, avoiding shell interpolation.
    const bytes = new Uint8Array(script.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < script.length; i++) {
        view.setUint16(i * 2, script.charCodeAt(i), true);
    }
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const child = new Deno.Command('powershell.exe', {
        args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        stdin: 'null',
        stdout: 'null',
        stderr: 'inherit',
    }).spawn();
    child.unref();
    return Promise.resolve();
}

/** Call after successful activation. A newer activation supersedes this request.
 * Cleanup failures must never turn a functioning upgrade into a failed activation.
 */
export async function retireExecutables(
    installation: string,
    activation: ActivationResult,
    options: CleanupOptions = {},
    defer: DeferredLauncher = launchDeferred,
): Promise<void> {
    try {
        await withInstallationLock(installation, async (root) => {
            const windows = Deno.build.os === 'windows';
            const currentLauncherTarget = await launcherTarget(root, windows);
            if (currentLauncherTarget !== activation.selectedExecutable) {
                return;
            }
            const runningExecutable = await Deno.realPath(
                options.runningExecutable ?? Deno.execPath(),
            );
            await removeOwnedExecutables(
                root,
                [currentLauncherTarget, windows ? runningExecutable : undefined],
                options,
            );
            if (windows) {
                const manifest = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
                const candidates = (manifest?.files ?? [])
                    .filter(
                        (file) =>
                            /^libexec\/cr-[A-Za-z0-9_.-]+$/.test(file.path) &&
                            join(root, file.path) !== currentLauncherTarget,
                    )
                    .map((file) => file.path);
                if (candidates.length) {
                    await defer(deferredCleanupScript(root, Deno.pid, candidates));
                }
            }
        });
    } catch (error) {
        (options.report ?? reportResidual)(installation, error);
    }
}
