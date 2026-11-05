import { expect } from '@std/expect';
import { join } from '@std/path';

import { packageRelease } from '../../tools/internal/package-build.ts';
import { targets } from '../../tools/internal/package-options.ts';
import { publishStable, stableIdentity } from '../../tools/internal/release.ts';
import { entries } from '../commands/upgrade/release-fixture.ts';

async function git(root: string, ...args: string[]): Promise<string> {
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
}

async function fixture(
    run: (root: string, commit: string, output: string) => Promise<void>,
    version = '0.1.0',
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'release-test-' });
    try {
        await Deno.mkdir(join(root, 'src/cli'), { recursive: true });
        await Deno.writeTextFile(
            join(root, 'src/cli/version.ts'),
            `export const CODERAIL_VERSION = '${version}';\n`,
        );
        await Deno.writeTextFile(
            join(root, 'CHANGELOG.md'),
            `# Changes\n\n## [Unreleased]\n\nFuture\n\n## [${version}] - 2026-11-05\n\n### Added\n\n- Authored notes.\n\n## [0.0.0]\n\nOlder\n\n[${version}]: https://example.com\n`,
        );
        await git(root, 'init', '-q');
        await git(root, 'add', '.');
        await git(root, 'commit', '-qm', 'Fixture');
        const commit = await git(root, 'rev-parse', 'HEAD');
        await git(root, 'tag', `v${version}`);
        const output = join(root, 'packages');
        for (const target of targets) {
            await packageRelease(
                { target, version, commit, output },
                root,
                async (_root, options, executable) => {
                    const binary = entries(version, options.target)[0];
                    if (!binary) {
                        throw new Error('Missing fixture binary');
                    }
                    await Deno.writeFile(executable, binary.data);
                },
            );
        }
        await run(root, commit, output);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

function transport(
    failure?: 'existing' | 'create' | 'upload' | 'assets' | 'latest' | 'invalid' | 'promote',
    latest?: string,
): {
    calls: { url: string; method: string; body: unknown }[];
    fetcher: typeof fetch;
} {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const assets: { name: string; state: string; size: number }[] = [];
    const fetcher: typeof fetch = (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({
            url,
            method,
            body:
                method === 'POST' && url.endsWith('/releases')
                    ? JSON.parse(String(init?.body))
                    : init?.body,
        });
        if (url.includes('/releases/42/assets') && method === 'GET') {
            return Promise.resolve(
                failure === 'assets' ? Response.json([]) : Response.json(assets),
            );
        }
        if (url.endsWith('/releases/latest')) {
            return Promise.resolve(
                failure === 'latest'
                    ? new Response(null, { status: 500 })
                    : failure === 'invalid'
                      ? Response.json({ tag_name: 'bad' })
                      : latest
                        ? Response.json({ tag_name: latest, draft: false, prerelease: false })
                        : new Response(null, { status: 404 }),
            );
        }
        if (method === 'PATCH') {
            return Promise.resolve(
                new Response(null, { status: failure === 'promote' ? 500 : 200 }),
            );
        }
        if (method === 'GET') {
            return Promise.resolve(
                new Response(null, { status: failure === 'existing' ? 200 : 404 }),
            );
        }
        if (url.endsWith('/releases')) {
            return Promise.resolve(
                Response.json({ id: 42 }, { status: failure === 'create' ? 500 : 201 }),
            );
        }
        assets.push({
            name: new URL(url).searchParams.get('name') ?? '',
            state: 'uploaded',
            size: (init?.body as Uint8Array).length,
        });
        return Promise.resolve(
            Response.json(
                { state: 'uploaded' },
                { status: failure === 'upload' && calls.length === 5 ? 502 : 201 },
            ),
        );
    };
    return { calls, fetcher };
}

Deno.test(
    'stable identity resolves lightweight/annotated tags and reads exact tagged notes',
    async () => {
        await fixture(async (root, commit) => {
            const expected = {
                tag: 'v0.1.0',
                version: '0.1.0',
                commit,
                notes: '### Added\n\n- Authored notes.',
            };
            expect(await stableIdentity(root, 'v0.1.0', commit)).toEqual(expected);
            await git(root, 'tag', '-d', 'v0.1.0');
            await git(root, 'tag', '-a', 'v0.1.0', '-m', 'Annotated');
            expect(await stableIdentity(root, 'v0.1.0', commit)).toEqual(expected);
            // Working files must never supply notes, even when they differ from the tag.
            await Deno.writeTextFile(join(root, 'CHANGELOG.md'), 'Moving main notes');
            expect(await stableIdentity(root, 'v0.1.0', commit)).toEqual(expected);
            for (const tag of ['0.1.0', 'v00.1.0', 'v0.1.0-beta', 'v0.1.0/extra']) {
                await expect(stableIdentity(root, tag, commit)).rejects.toThrow();
            }
            await expect(stableIdentity(root, 'v0.1.0', 'a'.repeat(40))).rejects.toThrow();
        });
    },
);

Deno.test(
    'stable publication checks all twelve assets before public creation then uploads exactly twelve',
    async () => {
        await fixture(async (root, commit, output) => {
            const mock = transport();
            await publishStable(root, 'v0.1.0', commit, output, 'token', mock.fetcher);
            expect(mock.calls.length).toBe(17);
            expect(mock.calls[0]?.method).toBe('GET');
            expect(mock.calls[1]).toEqual({
                url: 'https://api.github.com/repos/pavelmudroch/coderail/releases',
                method: 'POST',
                body: {
                    tag_name: 'v0.1.0',
                    target_commitish: commit,
                    name: 'v0.1.0',
                    body: '### Added\n\n- Authored notes.',
                    draft: false,
                    prerelease: false,
                    make_latest: 'false',
                },
            });
            expect(
                mock.calls.slice(2, 14).map((call) => new URL(call.url).searchParams.get('name')),
            ).toEqual(
                targets.flatMap((target) => [
                    `coderail-${target}.zip`,
                    `coderail-${target}.zip.sha256`,
                ]),
            );
            expect(
                mock.calls
                    .slice(2, 14)
                    .every((call) =>
                        call.url.startsWith(
                            'https://uploads.github.com/repos/pavelmudroch/coderail/releases/42/assets?',
                        ),
                    ),
            ).toBe(true);
        });
    },
);

Deno.test(
    'missing builds, missing sidecars, corruption and mismatched packages never create a release',
    async () => {
        await fixture(async (root, commit, output) => {
            for (const name of targets.flatMap((target) => [
                `coderail-${target}.zip`,
                `coderail-${target}.zip.sha256`,
            ])) {
                const path = join(output, name);
                const bytes = await Deno.readFile(path);
                for (const corrupt of [false, true]) {
                    const mock = transport();
                    if (corrupt) {
                        await Deno.writeTextFile(path, 'corrupt');
                    } else {
                        await Deno.remove(path);
                    }
                    await expect(
                        publishStable(root, 'v0.1.0', commit, output, 'token', mock.fetcher),
                    ).rejects.toThrow('package checks');
                    expect(mock.calls).toEqual([]);
                    await Deno.writeFile(path, bytes);
                }
            }
            // An otherwise valid archive from a different source commit is also rejected.
            const mock = transport();
            await git(root, 'commit', '--allow-empty', '-qm', 'Different source');
            const next = await git(root, 'rev-parse', 'HEAD');
            await git(root, 'tag', '-f', 'v0.1.0');
            await expect(
                publishStable(root, 'v0.1.0', next, output, 'token', mock.fetcher),
            ).rejects.toThrow('package checks');
            expect(mock.calls).toEqual([]);
        });
    },
);

Deno.test(
    'identity failures prevent creation; release failures retain public partial state without cleanup or retry',
    async () => {
        await fixture(async (root, commit, output) => {
            for (const failure of ['existing', 'create', 'upload'] as const) {
                const mock = transport(failure);
                await expect(
                    publishStable(root, 'v0.1.0', commit, output, 'token', mock.fetcher),
                ).rejects.toThrow(
                    failure === 'existing'
                        ? 'existing release'
                        : failure === 'create'
                          ? 'public creation'
                          : 'upload coderail-',
                );
                expect(mock.calls.length).toBe(
                    failure === 'existing' ? 1 : failure === 'create' ? 2 : 5,
                );
                expect(mock.calls.every((call) => ['GET', 'POST'].includes(call.method))).toBe(
                    true,
                );
            }
            const partial = transport('upload');
            await expect(
                publishStable(root, 'v0.1.0', commit, output, 'token', partial.fetcher),
            ).rejects.toThrow('retained with 2/12 confirmed uploads');
            const mock = transport();
            await expect(
                publishStable(root, 'v0.1.1', commit, output, 'token', mock.fetcher),
            ).rejects.toThrow();
            expect(mock.calls).toEqual([]);
            await git(root, 'tag', 'v0.1.1');
            await expect(
                publishStable(root, 'v0.1.1', commit, output, 'token', mock.fetcher),
            ).rejects.toThrow('source version');
            expect(mock.calls).toEqual([]);
            await Deno.writeTextFile(join(root, 'CHANGELOG.md'), '## [Unreleased]\n');
            await git(root, 'add', 'CHANGELOG.md');
            await git(root, 'commit', '-qm', 'Missing notes');
            await git(root, 'tag', '-f', 'v0.1.0');
            await expect(
                publishStable(
                    root,
                    'v0.1.0',
                    await git(root, 'rev-parse', 'HEAD'),
                    output,
                    'token',
                    mock.fetcher,
                ),
            ).rejects.toThrow('changelog');
            expect(mock.calls).toEqual([]);
        });
    },
);

Deno.test('promotion follows complete uploads and compares stable versions safely', async () => {
    await fixture(async (root, commit, output) => {
        for (const [latest, promote] of [
            [undefined, true],
            ['v0.0.9', true],
            ['0.1.0', false],
            ['v0.1.1', false],
            ['v0.0.10', true],
            ['v0.10.0', false],
        ] as const) {
            const mock = transport(undefined, latest);
            await publishStable(root, 'v0.1.0', commit, output, 'token', mock.fetcher);
            expect(mock.calls[14]?.url).toContain('/releases/42/assets');
            expect(mock.calls[15]?.url).toContain('/releases/latest');
            expect(mock.calls.filter((call) => call.method === 'PATCH').length).toBe(
                promote ? 1 : 0,
            );
            if (promote) {
                expect(JSON.parse(String(mock.calls[16]?.body))).toEqual({ make_latest: 'true' });
            }
        }
        for (const failure of ['assets', 'latest', 'invalid', 'promote'] as const) {
            const mock = transport(failure);
            await expect(
                publishStable(root, 'v0.1.0', commit, output, 'token', mock.fetcher),
            ).rejects.toThrow('retained');
            if (failure !== 'promote') {
                expect(mock.calls.some((call) => call.method === 'PATCH')).toBe(false);
            }
        }
    });
});

Deno.test('stable workflow serializes the complete publication decision across tags', async () => {
    const workflow = await Deno.readTextFile('.github/workflows/release.yml');
    const publish = workflow.slice(workflow.indexOf('  publish:'));
    expect(publish).toContain('needs: [identity, check]');
    expect(publish).toContain('group: stable-publication');
    expect(publish).toContain('cancel-in-progress: false');
    expect(
        publish.indexOf('concurrency:') < publish.indexOf('tools/internal/release.ts publish'),
    ).toBe(true);
    // The newer job acquires the workflow lock and completes before the older job.
    await fixture(async (newRoot, newCommit, newOutput) => {
        const newer = transport();
        await publishStable(newRoot, 'v0.2.0', newCommit, newOutput, 'token', newer.fetcher);
        expect(newer.calls.some((call) => call.method === 'PATCH')).toBe(true);
        await fixture(async (root, commit, output) => {
            const older = transport(undefined, 'v0.2.0');
            await publishStable(root, 'v0.1.0', commit, output, 'token', older.fetcher);
            expect(older.calls.some((call) => call.method === 'PATCH')).toBe(false);
        });
    }, '0.2.0');
});
