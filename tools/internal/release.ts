import { join } from '@std/path';

import { targets } from './package-options.ts';
import { checkPackages, githubRequest, releaseApi as api, uploadPackages } from './publication.ts';
export type StableIdentity = { tag: string; version: string; commit: string; notes: string };

async function git(root: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd: root,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!result.success) {
        throw new Error(`git ${args.join(' ')} failed: ${new TextDecoder().decode(result.stderr)}`);
    }
    return new TextDecoder().decode(result.stdout).trim();
}

export async function stableIdentity(
    root: string,
    tag: string,
    commit: string,
): Promise<StableIdentity> {
    if (
        !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) ||
        !/^[0-9a-f]{40}$/.test(commit)
    ) {
        throw new Error('Expected canonical vX.Y.Z tag and full lowercase source SHA');
    }
    if (
        (await git(root, 'rev-parse', `refs/tags/${tag}^{commit}`)) !== commit ||
        (await git(root, 'rev-parse', 'HEAD')) !== commit
    ) {
        throw new Error('Tag and checked-out HEAD must resolve to the exact source commit');
    }
    const version = tag.slice(1);
    const source = await git(root, 'show', `${commit}:src/cli/version.ts`);
    const declarations = [...source.matchAll(/export const CODERAIL_VERSION = '([^']+)';/g)];
    if (declarations.length !== 1 || declarations[0]?.[1] !== version) {
        throw new Error('Tag must match source version');
    }
    const changelog = await git(root, 'show', `${commit}:CHANGELOG.md`);
    const section = new RegExp(
        `^## \\[${version.replaceAll('.', '\\.')}\\][^\\r\\n]*\\r?\\n`,
        'gm',
    );
    const matches = [...changelog.matchAll(section)];
    const match = matches[0];
    if (matches.length !== 1 || !match) {
        throw new Error('Expected one tagged changelog section');
    }
    const rest = changelog.slice(match.index + match[0].length);
    const boundary = /^(?:## |\[[^\]\r\n]+\]:)/m.exec(rest);
    const notes = rest.slice(0, boundary?.index ?? rest.length).trim();
    if (!notes.replace(/^\s*#{3,6}[^\r\n]*$/gm, '').trim()) {
        throw new Error('Tagged changelog section must contain authored notes');
    }
    return { tag, version, commit, notes };
}

export async function checkStable(
    root: string,
    tag: string,
    commit: string,
    output: string,
): Promise<StableIdentity> {
    const identity = await stableIdentity(root, tag, commit);
    await checkPackages(identity.version, commit, output);
    return identity;
}

// Public creation deliberately precedes uploads. No retry, rollback, replacement,
// tag mutation, or recovery interface: errors retain all remote state for inspection.
export async function publishStable(
    root: string,
    tag: string,
    commit: string,
    output: string,
    token: string,
    fetcher: typeof fetch = fetch,
): Promise<void> {
    let step = 'identity and package checks';
    let state = 'No public release creation attempted.';
    try {
        const identity = await checkStable(root, tag, commit, output);
        const request = githubRequest(token, fetcher);
        step = 'existing release preflight';
        const existing = await request(`${api}/releases/tags/${tag}`);
        if (existing.status !== 404) {
            throw new Error(
                existing.ok
                    ? 'An existing release cannot be replaced'
                    : `GitHub HTTP ${existing.status}`,
            );
        }
        step = 'public creation';
        state = `Public release ${tag} may exist; inspect GitHub before any manual action.`;
        const created = await request(
            `${api}/releases`,
            'POST',
            JSON.stringify({
                tag_name: tag,
                target_commitish: commit,
                name: tag,
                body: identity.notes,
                draft: false,
                prerelease: false,
                make_latest: 'false',
            }),
        );
        if (created.status !== 201) {
            throw new Error(`GitHub HTTP ${created.status}`);
        }
        const release = await created.json();
        if (!Number.isSafeInteger(release.id) || release.id <= 0) {
            throw new Error('Invalid created release ID');
        }
        state = `Public release ${tag} (id ${release.id}) retained; assets may be incomplete.`;
        await uploadPackages(
            request,
            release.id,
            output,
            (name) => {
                step = `upload ${name}`;
            },
            (uploaded) => {
                state = `Public release ${tag} (id ${release.id}) retained with ${uploaded}/12 confirmed uploads; last upload may have partial state.`;
            },
        );
        step = 'remote asset validation';
        const response = await request(`${api}/releases/${release.id}/assets?per_page=100`);
        if (!response.ok) {
            throw new Error(`GitHub HTTP ${response.status}`);
        }
        const assets: unknown = await response.json();
        const names = targets.flatMap((target) => [
            `coderail-${target}.zip`,
            `coderail-${target}.zip.sha256`,
        ]);
        if (!Array.isArray(assets) || assets.length !== names.length) {
            throw new Error('Invalid remote asset set');
        }
        for (const name of names) {
            const matches = assets.filter((asset) => asset?.name === name);
            const size = (await Deno.stat(join(output, name))).size;
            if (
                matches.length !== 1 ||
                matches[0].state !== 'uploaded' ||
                matches[0].size !== size
            ) {
                throw new Error(`Invalid remote asset ${name}`);
            }
        }
        state = `Public release ${tag} (id ${release.id}) retained with all assets uploaded.`;
        step = 'latest release lookup';
        const latest = await request(`${api}/releases/latest`);
        let promote = latest.status === 404;
        if (!promote) {
            if (!latest.ok) {
                throw new Error(`GitHub HTTP ${latest.status}`);
            }
            const current = await latest.json();
            const match =
                typeof current.tag_name === 'string' &&
                /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(current.tag_name);
            if (!match || current.draft !== false || current.prerelease !== false) {
                throw new Error('Invalid latest release identity');
            }
            const candidate = identity.version.split('.').map(BigInt);
            const previous = match.slice(1).map(BigInt);
            for (let i = 0; i < 3; i++) {
                const nextPart = candidate[i];
                const currentPart = previous[i];
                if (nextPart === undefined || currentPart === undefined) {
                    throw new Error('Invalid version');
                }
                if (nextPart !== currentPart) {
                    promote = nextPart > currentPart;
                    break;
                }
            }
        }
        if (promote) {
            step = 'latest promotion';
            const result = await request(
                `${api}/releases/${release.id}`,
                'PATCH',
                JSON.stringify({ make_latest: 'true' }),
            );
            if (!result.ok) {
                throw new Error(`GitHub HTTP ${result.status}`);
            }
        }
    } catch (error) {
        throw new Error(
            `Release failed during ${step}: ${error instanceof Error ? error.message : String(error)}\n${state}\nNo automatic cleanup or retry; inspect remote state manually.`,
            { cause: error },
        );
    }
}

if (import.meta.main) {
    try {
        const [mode, tag, commit, output] = Deno.args;
        if (
            !['identity', 'check', 'publish'].includes(mode ?? '') ||
            !tag ||
            !commit ||
            (mode !== 'identity' && !output) ||
            Deno.args.length !== (mode === 'identity' ? 3 : 4)
        ) {
            throw new Error(
                'Usage: deno run -A tools/internal/release.ts <identity|check|publish> <vX.Y.Z> <full-sha> [package-directory]',
            );
        }
        if (mode === 'identity') {
            const identity = await stableIdentity(Deno.cwd(), tag, commit);
            const destination = Deno.env.get('GITHUB_OUTPUT');
            if (destination) {
                await Deno.writeTextFile(
                    destination,
                    `version=${identity.version}\ncommit=${identity.commit}\n`,
                    { append: true },
                );
            }
            console.log(JSON.stringify(identity));
        } else if (mode === 'check') {
            await checkStable(Deno.cwd(), tag, commit, output ?? '');
        } else {
            await publishStable(
                Deno.cwd(),
                tag,
                commit,
                output ?? '',
                Deno.env.get('GH_TOKEN') ?? '',
            );
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        Deno.exitCode = 1;
    }
}
