import { checkPackages, githubRequest, releaseApi as api, uploadPackages } from './publication.ts';

export async function canaryIdentity(
    root: string,
    commit: string,
): Promise<{ tag: string; version: string; commit: string }> {
    if (!/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error('Expected full lowercase source SHA');
    }
    const head = await new Deno.Command('git', {
        cwd: root,
        args: ['rev-parse', 'HEAD'],
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!head.success || new TextDecoder().decode(head.stdout).trim() !== commit) {
        throw new Error('Checked-out HEAD must match the exact event tip');
    }
    return { tag: 'canary', version: 'canary', commit };
}

export async function checkCanary(root: string, commit: string, output: string): Promise<void> {
    await canaryIdentity(root, commit);
    await checkPackages('canary', commit, output);
}

// Caller MUST hold the repository-wide canary-publication Actions concurrency lock
// for this entire function. Never cancel a running publisher to make room for another.
// Freshness alone cannot fence an in-flight API request; serialization prevents a
// newer publisher from running until all older requests have completed.
export async function publishCanary(
    root: string,
    commit: string,
    output: string,
    token: string,
    fetcher: typeof fetch = fetch,
): Promise<void> {
    let step = 'identity and package checks';
    let state = 'Prior canary has not been changed.';
    try {
        await checkCanary(root, commit, output);
        const request = githubRequest(token, fetcher);
        const fresh = async (): Promise<void> => {
            const response = await request(`${api}/git/ref/heads/main`);
            if (!response.ok) {
                throw new Error(`Main freshness HTTP ${response.status}`);
            }
            if ((await response.json()).object?.sha !== commit) {
                throw new Error('Superseded: authoritative main no longer matches this event tip');
            }
        };
        step = 'publication boundary freshness';
        await fresh();
        step = 'rolling release preflight';
        const existing = await request(`${api}/releases/tags/canary`);
        let releaseId: number | undefined;
        if (existing.ok) {
            const release = await existing.json();
            if (!Number.isSafeInteger(release.id) || release.id <= 0) {
                throw new Error('Invalid release ID');
            }
            if (release.target_commitish === commit) {
                throw new Error(
                    'Canary already targets this source; inspect manually, no retry/resume',
                );
            }
            releaseId = release.id;
        } else if (existing.status !== 404) {
            throw new Error(`GitHub HTTP ${existing.status}`);
        }
        const tag = await request(`${api}/git/ref/tags/canary`);
        if (!tag.ok && tag.status !== 404) {
            throw new Error(`GitHub HTTP ${tag.status}`);
        }
        if (releaseId !== undefined) {
            step = 'rolling release replacement';
            await fresh();
            state = `Prior canary (id ${releaseId}) may have been removed; inspect release and tag manually.`;
            const removed = await request(`${api}/releases/${releaseId}`, 'DELETE');
            if (removed.status !== 204) {
                throw new Error(`GitHub HTTP ${removed.status}`);
            }
        }
        step = 'rolling tag update';
        await fresh();
        state = 'Rolling canary tag/release may have changed; inspect remote state manually.';
        const moved = await request(
            tag.ok ? `${api}/git/refs/tags/canary` : `${api}/git/refs`,
            tag.ok ? 'PATCH' : 'POST',
            JSON.stringify(
                tag.ok ? { sha: commit, force: true } : { ref: 'refs/tags/canary', sha: commit },
            ),
        );
        if (moved.status !== (tag.ok ? 200 : 201)) {
            throw new Error(`GitHub HTTP ${moved.status}`);
        }
        step = 'public prerelease creation';
        await fresh();
        state = `Public canary at ${commit} may exist; inspect remote state manually.`;
        const created = await request(
            `${api}/releases`,
            'POST',
            JSON.stringify({
                tag_name: 'canary',
                target_commitish: commit,
                name: 'canary',
                body: `Automatic main-tip build from ${commit}. Application tests are not a publication gate.`,
                draft: false,
                prerelease: true,
            }),
        );
        if (created.status !== 201) {
            throw new Error(`GitHub HTTP ${created.status}`);
        }
        const release = await created.json();
        if (!Number.isSafeInteger(release.id) || release.id <= 0) {
            throw new Error('Invalid created release ID');
        }
        const progress = (count: number): void => {
            state = `Public canary (id ${release.id}, source ${commit}) retained with ${count}/12 confirmed uploads; last upload may have partial state.`;
        };
        progress(0);
        await uploadPackages(
            request,
            release.id,
            output,
            async (name) => {
                step = `upload ${name}`;
                await fresh();
            },
            progress,
        );
        step = 'final freshness';
        await fresh();
    } catch (error) {
        throw new Error(
            `Canary failed during ${step}: ${error instanceof Error ? error.message : String(error)}\n${state}\nNo automatic cleanup, rollback or retry; inspect remote state manually.`,
            { cause: error },
        );
    }
}

if (import.meta.main) {
    try {
        const [mode, commit, output] = Deno.args;
        if (
            !['check', 'publish'].includes(mode ?? '') ||
            !commit ||
            !output ||
            Deno.args.length !== 3
        ) {
            throw new Error(
                'Usage: deno run -A tools/canary.ts <check|publish> <full-sha> <package-directory>',
            );
        }
        if (mode === 'check') {
            await checkCanary(Deno.cwd(), commit, output);
        } else {
            await publishCanary(Deno.cwd(), commit, output, Deno.env.get('GH_TOKEN') ?? '');
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        Deno.exitCode = 1;
    }
}
