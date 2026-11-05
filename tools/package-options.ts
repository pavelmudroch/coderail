export const compilerVersion = '2.9.8';
export const targets = [
    'x86_64-unknown-linux-gnu',
    'aarch64-unknown-linux-gnu',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-pc-windows-msvc',
    'aarch64-pc-windows-msvc',
] as const;
export type PackageOptions = { target: string; version: string; commit: string; output: string };

export const usage = `Usage: deno run -A tools/package.ts --target <triple> --version <X.Y.Z|canary> --commit <full-sha> --output <directory>

All four options are required. Run in the clean checked-out source revision.
--target selects x86_64 or aarch64 for unknown-linux-gnu, apple-darwin,
  or pc-windows-msvc. Compiler: Deno ${compilerVersion} (also required by CI).
--version is canonical X.Y.Z matching src/cli/version.ts, or canary.
--commit is the exact full lowercase 40-character HEAD commit.
--output receives coderail-<target>.zip and coderail-<target>.zip.sha256
  after compilation and staging-consumer package checks pass. No overwrites.
--help prints help without repository checks, network, compilation, or edits.

This command performs no publication or application-test gating.
Check collected packages with tools/check-package.ts using the same options.
`;

export function parsePackageArguments(args: string[]): PackageOptions | 'help' {
    if (args.length === 1 && args[0] === '--help') {
        return 'help';
    }
    const values = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];
        if (
            !key ||
            !['--target', '--version', '--commit', '--output'].includes(key) ||
            !value ||
            value.startsWith('--') ||
            values.has(key)
        ) {
            throw new Error(usage);
        }
        values.set(key, value);
    }
    const target = values.get('--target');
    const version = values.get('--version');
    const commit = values.get('--commit');
    const output = values.get('--output');
    if (!target || !version || !commit || !output) {
        throw new Error(usage);
    }
    if (!targets.some((value) => value === target)) {
        throw new Error('Unsupported target');
    }
    if (version !== 'canary' && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error('Invalid version');
    }
    if (!/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error('Invalid commit: expected full lowercase SHA-1');
    }
    return { target, version, commit, output };
}
