import { join } from '@std/path';

import {
    type Build,
    resolveRelease,
    type StagedDistribution,
    withStagedDistribution,
} from '../src/commands/upgrade/distribution.ts';
import { type PackageOptions, parsePackageArguments } from './internal/package-options.ts';

export async function sha256(bytes: Uint8Array): Promise<string> {
    return Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
        (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
}

// In-memory release transport: the production consumer remains the ZIP authority.
export async function checkPackage(
    options: PackageOptions,
    consume: (stage: StagedDistribution) => Promise<void> = async () => {},
): Promise<void> {
    const name = `coderail-${options.target}.zip`;
    for (const file of [name, `${name}.sha256`]) {
        if (!(await Deno.lstat(join(options.output, file))).isFile) {
            throw new Error(`Not a regular package output: ${file}`);
        }
    }
    const archive = await Deno.readFile(join(options.output, name));
    const checksum = await Deno.readFile(join(options.output, `${name}.sha256`));
    const publication = {
        id: 1,
        tag_name: options.version === 'canary' ? 'canary' : `v${options.version}`,
        draft: false,
        prerelease: options.version === 'canary',
        target_commitish: options.commit,
        updated_at: 'package-check',
    };
    const assets = [archive, checksum].map((bytes, i) => ({
        id: i + 10,
        name: i === 0 ? name : `${name}.sha256`,
        size: bytes.length,
        state: 'uploaded',
        updated_at: 'package-check',
    }));
    const fetcher: typeof fetch = (input) => {
        const url = new URL(String(input));
        const path = url.pathname;
        if (
            url.origin !== 'https://api.github.com' ||
            !path.startsWith('/repos/pavelmudroch/coderail/')
        ) {
            throw new Error(`Unexpected package request: ${url}`);
        }
        if (path.endsWith('/releases/assets/10')) {
            return Promise.resolve(new Response(new Uint8Array(archive)));
        }
        if (path.endsWith('/releases/assets/11')) {
            return Promise.resolve(new Response(new Uint8Array(checksum)));
        }
        if (path.endsWith('/releases/1/assets')) {
            return Promise.resolve(Response.json(assets));
        }
        if (path.endsWith('/releases')) {
            return Promise.resolve(Response.json([publication]));
        }
        if (path.endsWith(`/releases/tags/${publication.tag_name}`)) {
            return Promise.resolve(Response.json(publication));
        }
        throw new Error(`Unexpected package request: ${url}`);
    };
    const resolved = await resolveRelease(
        options.version === 'canary' ? { canary: true } : { version: options.version },
        options.target,
        fetcher,
    );
    await withStagedDistribution(
        resolved,
        async (stage) => {
            const expected: Build = {
                schemaVersion: 1,
                version: options.version,
                commit: options.commit,
                target: options.target,
            };
            if (
                (await Deno.readTextFile(join(stage.root, 'build.json'))) !==
                JSON.stringify(expected)
            ) {
                throw new Error('Build metadata must match the exact packaging schema');
            }
            await consume(stage);
        },
        fetcher,
    );
}

if (import.meta.main) {
    try {
        const options = parsePackageArguments(Deno.args);
        if (options === 'help') {
            console.log(
                'Usage: deno run -A tools/check-package.ts --target <triple> --version <X.Y.Z|canary> --commit <full-sha> --output <directory>\nChecks an existing archive and exact checksum through the upgrade staging consumer, offline.',
            );
        } else {
            await checkPackage(options);
            console.log(`Checked ${options.target} ${options.version} ${options.commit}`);
        }
    } catch (error) {
        console.error(
            `Package validation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        Deno.exitCode = 1;
    }
}
