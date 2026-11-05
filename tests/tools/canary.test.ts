import { expect } from '@std/expect';
import { join } from '@std/path';

import { canaryIdentity, publishCanary } from '../../tools/internal/canary.ts';
import { packageRelease } from '../../tools/internal/package-build.ts';
import { targets } from '../../tools/internal/package-options.ts';
import { entries } from '../commands/upgrade/release-fixture.ts';

Deno.test(
    'canary workflow requires all six native package checks before serialized publication',
    async () => {
        const workflow = await Deno.readTextFile(
            new URL('../../.github/workflows/canary.yml', import.meta.url),
        );
        expect(workflow).toContain('push:\n    branches: [main]');
        expect([...workflow.matchAll(/target: (\S+)/g)].map((match) => match[1])).toEqual([
            ...targets,
        ]);
        expect([...workflow.matchAll(/runner: (\S+)/g)].map((match) => match[1])).toEqual([
            'ubuntu-24.04',
            'ubuntu-24.04-arm',
            'macos-15-intel',
            'macos-15',
            'windows-2025',
            'windows-11-arm',
        ]);
        const build = workflow.split('  build:')[1]?.split('\n  check:')[0] ?? '';
        expect(build).toContain('fail-fast: false');
        expect(build).toContain('VERSION: canary');
        expect(build).toContain('tools/package.ts');
        expect(build).toContain('tools/internal/smoke-package.ts');
        expect(workflow).toContain('  check:\n    needs: build');
        expect(workflow).toContain('tools/internal/canary.ts check');
        expect(workflow).toContain('  publish:\n    needs: check');
        expect(workflow).toContain('group: canary-publication\n      cancel-in-progress: false');
        expect(workflow).toContain('tools/internal/canary.ts publish');
        expect([...workflow.matchAll(/ref: (.+)/g)].map((match) => match[1])).toEqual(
            Array(3).fill('${{ github.sha }}'),
        );
        expect([...workflow.matchAll(/deno-version: '(.+)'/g)].map((match) => match[1])).toEqual(
            Array(3).fill('2.9.8'),
        );
        expect(workflow).not.toMatch(
            /deno test|cr verify|workflow_dispatch|environment:|if:|continue-on-error:|always\(\)/,
        );
    },
);

async function fixture(
    run: (root: string, commits: [string, string], outputs: [string, string]) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'canary-test-' });
    try {
        const git = async (...args: string[]): Promise<string> => {
            const result = await new Deno.Command('git', {
                cwd: root,
                env: {
                    GIT_CONFIG_NOSYSTEM: '1',
                    GIT_CONFIG_GLOBAL: Deno.build.os === 'windows' ? 'NUL' : '/dev/null',
                },
                args: ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            expect(result.success, new TextDecoder().decode(result.stderr)).toBe(true);
            return new TextDecoder().decode(result.stdout).trim();
        };
        await Deno.mkdir(join(root, 'src/cli'), { recursive: true });
        await Deno.writeTextFile(
            join(root, 'src/cli/version.ts'),
            "export const CODERAIL_VERSION = '0.1.0';\n",
        );
        await git('init', '-q');
        await git('add', '.');
        const commits: [string, string] = ['', ''];
        const outputs: [string, string] = ['', ''];
        for (const i of [0, 1] as const) {
            await git('commit', '--allow-empty', '-qm', `Source ${i}`);
            const commit = await git('rev-parse', 'HEAD');
            const output = join(root, `packages-${i}`);
            for (const target of targets) {
                await packageRelease(
                    { target, version: 'canary', commit, output },
                    root,
                    async (_root, options, executable) => {
                        await Deno.writeFile(
                            executable,
                            entries('canary', options.target)[0]?.data ?? new Uint8Array(),
                        );
                    },
                );
            }
            commits[i] = commit;
            outputs[i] = output;
        }
        await run(root, commits, outputs);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

// Shared fake authoritative state; the workflow supplies the serialization boundary.
type RemoteState = {
    main: string;
    release: { id: number; target_commitish: string } | undefined;
    tag: string | undefined;
    uploads: number;
    failUpload: boolean;
    afterMutation: (() => Promise<void> | void) | undefined;
};
type Call = { path: string; method: string; body: Record<string, unknown> };
function remote(main: string): { state: RemoteState; calls: Call[]; fetcher: typeof fetch } {
    const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
    const state: RemoteState = {
        main,
        release: undefined as { id: number; target_commitish: string } | undefined,
        tag: undefined as string | undefined,
        uploads: 0,
        failUpload: false,
        afterMutation: undefined as (() => Promise<void> | void) | undefined,
    };
    const fetcher: typeof fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        const method = init?.method ?? 'GET';
        const body =
            method !== 'GET' && !path.endsWith('/assets') && init?.body
                ? JSON.parse(String(init.body))
                : {};
        calls.push({ path, method, body });
        if (method === 'GET') {
            if (path.endsWith('/git/ref/heads/main')) {
                expect(new Headers(init?.headers).get('Cache-Control')).toBe('no-cache');
                return Response.json({ object: { sha: state.main } });
            }
            if (path.endsWith('/releases/tags/canary')) {
                return state.release
                    ? Response.json(state.release)
                    : new Response(null, { status: 404 });
            }
            if (path.endsWith('/git/ref/tags/canary')) {
                return state.tag
                    ? Response.json({ object: { sha: state.tag } })
                    : new Response(null, { status: 404 });
            }
            throw new Error(`Unexpected GET ${path}`);
        }
        let response: Response;
        if (method === 'DELETE') {
            state.release = undefined;
            response = new Response(null, { status: 204 });
        } else if (path.endsWith('/git/refs') || path.endsWith('/git/refs/tags/canary')) {
            state.tag = String(body.sha);
            response = Response.json({}, { status: method === 'PATCH' ? 200 : 201 });
        } else if (path.endsWith('/releases')) {
            state.release = { id: calls.length, target_commitish: String(body.target_commitish) };
            state.uploads = 0;
            response = Response.json(state.release, { status: 201 });
        } else if (path.endsWith('/assets')) {
            state.uploads++;
            response = Response.json(
                { state: 'uploaded' },
                { status: state.failUpload ? 502 : 201 },
            );
        } else {
            throw new Error(`Unexpected mutation ${method} ${path}`);
        }
        await state.afterMutation?.();
        return response;
    };
    return { state, calls, fetcher };
}

Deno.test(
    'canary uses the event tip, checks six packages and replaces the rolling public prerelease',
    async () => {
        await fixture(async (root, commits, outputs) => {
            const commit = commits[1];
            expect(await canaryIdentity(root, commit)).toEqual({
                tag: 'canary',
                version: 'canary',
                commit,
            });
            await expect(canaryIdentity(root, commits[0])).rejects.toThrow();
            await expect(canaryIdentity(root, 'main')).rejects.toThrow();
            const mock = remote(commit);
            mock.state.release = { id: 1, target_commitish: commits[0] };
            mock.state.tag = commits[0];
            await publishCanary(root, commit, outputs[1], 'token', mock.fetcher);
            expect(mock.state.tag).toBe(commit);
            expect(mock.state.uploads).toBe(12);
            const created = mock.calls.find(
                (call) => call.path.endsWith('/releases') && call.method === 'POST',
            );
            expect(created?.body).toEqual({
                tag_name: 'canary',
                target_commitish: commit,
                name: 'canary',
                body: `Automatic main-tip build from ${commit}. Application tests are not a publication gate.`,
                draft: false,
                prerelease: true,
            });
            const mutations = mock.calls.filter((call) => call.method !== 'GET');
            expect(mutations.map((call) => call.method)).toEqual([
                'DELETE',
                'PATCH',
                'POST',
                ...Array(12).fill('POST'),
            ]);
            const beforeRetry = mock.calls.length;
            await expect(
                publishCanary(root, commit, outputs[1], 'token', mock.fetcher),
            ).rejects.toThrow('already targets');
            expect(mock.calls.slice(beforeRetry).every((call) => call.method === 'GET')).toBe(true);
        });
    },
);

Deno.test(
    'older build finishing last cannot replace newer publication, regardless of queue order',
    async () => {
        await fixture(async (root, commits, outputs) => {
            const mock = remote(commits[1]);
            await publishCanary(root, commits[1], outputs[1], 'token', mock.fetcher);
            const published = mock.state.release;
            const count = mock.calls.length;
            // The old build's own checkout is still old when it acquires the same lock.
            const result = await new Deno.Command('git', {
                cwd: root,
                args: ['checkout', '--detach', commits[0]],
            }).output();
            expect(result.success).toBe(true);
            await expect(
                publishCanary(root, commits[0], outputs[0], 'token', mock.fetcher),
            ).rejects.toThrow('Superseded');
            expect(mock.state.release).toEqual(published);
            expect(mock.calls.slice(count).every((call) => call.method === 'GET')).toBe(true);
        });
    },
);

Deno.test(
    'main advancing during any publication mutation stops further mutations under the lock',
    async () => {
        await fixture(async (root, commits, outputs) => {
            // Simulate a new push while deletion, tag update, creation, or an upload is in flight.
            for (let boundary = 1; boundary <= 15; boundary++) {
                const mock = remote(commits[1]);
                mock.state.release = { id: 1, target_commitish: commits[0] };
                mock.state.tag = commits[0];
                let mutations = 0;
                mock.state.afterMutation = () => {
                    if (++mutations === boundary) {
                        mock.state.main = 'f'.repeat(40);
                    }
                };
                await expect(
                    publishCanary(root, commits[1], outputs[1], 'token', mock.fetcher),
                ).rejects.toThrow('Superseded');
                expect(mutations).toBe(boundary);
                expect(mock.calls.at(-1)?.path).toContain('/git/ref/heads/main');
            }
        });
    },
);

Deno.test(
    'missing or corrupt assets preserve prior canary; upload failure retains partial public state',
    async () => {
        await fixture(async (root, commits, outputs) => {
            for (const target of targets) {
                for (const suffix of ['', '.sha256']) {
                    const path = join(outputs[1], `coderail-${target}.zip${suffix}`);
                    const original = await Deno.readFile(path);
                    for (const corrupt of [false, true]) {
                        const mock = remote(commits[1]);
                        mock.state.release = { id: 1, target_commitish: commits[0] };
                        if (corrupt) {
                            await Deno.writeTextFile(path, 'invalid');
                        } else {
                            await Deno.remove(path);
                        }
                        await expect(
                            publishCanary(root, commits[1], outputs[1], 'token', mock.fetcher),
                        ).rejects.toThrow('package checks');
                        expect(mock.calls).toEqual([]);
                        await Deno.writeFile(path, original);
                    }
                }
            }
            const mock = remote(commits[1]);
            mock.state.failUpload = true;
            await expect(
                publishCanary(root, commits[1], outputs[1], 'token', mock.fetcher),
            ).rejects.toThrow('0/12 confirmed uploads');
            expect(mock.state.release?.target_commitish).toBe(commits[1]);
            expect(mock.state.uploads).toBe(1);
            expect(mock.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
        });
    },
);

Deno.test(
    'a newer publisher waits for an in-flight old upload, then replaces its partial canary',
    async () => {
        await fixture(async (root, commits, outputs) => {
            const oldRoot = join(root, 'old-source');
            for (const args of [
                ['clone', '--quiet', root, oldRoot],
                ['-C', oldRoot, 'checkout', '--quiet', '--detach', commits[0]],
            ]) {
                const result = await new Deno.Command('git', { args }).output();
                expect(result.success).toBe(true);
            }
            const mock = remote(commits[0]);
            let finishRequest: () => void = () => {
                throw new Error('Request not started');
            };
            const requestPending = new Promise<void>((resolve) => {
                finishRequest = resolve;
            });
            let requestStarted: () => void = () => {
                throw new Error('Missing waiter');
            };
            const started = new Promise<void>((resolve) => {
                requestStarted = resolve;
            });
            mock.state.afterMutation = async () => {
                if (mock.state.uploads === 1) {
                    mock.state.afterMutation = undefined;
                    requestStarted();
                    await requestPending;
                }
            };
            const oldJob = expect(
                publishCanary(oldRoot, commits[0], outputs[0], 'token', mock.fetcher),
            ).rejects.toThrow('Superseded');
            await started;
            mock.state.main = commits[1];
            // Model the job-level Actions lock: the new publisher may only enter after
            // the old job finishes, including the outstanding request's response.
            const newJob = oldJob.then(() =>
                publishCanary(root, commits[1], outputs[1], 'token', mock.fetcher),
            );
            expect(mock.state.release?.target_commitish).toBe(commits[0]);
            expect(mock.state.uploads).toBe(1);
            finishRequest();
            await newJob;
            expect(mock.state.release?.target_commitish).toBe(commits[1]);
            expect(mock.state.tag).toBe(commits[1]);
            expect(mock.state.uploads).toBe(12);
        });
    },
);
