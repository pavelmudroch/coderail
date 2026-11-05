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
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'release-test-' });
    try {
        await Deno.mkdir(join(root, 'src/cli'), { recursive: true });
        await Deno.writeTextFile(
            join(root, 'src/cli/version.ts'),
            "export const CODERAIL_VERSION = '0.1.0';\n",
        );
        await Deno.writeTextFile(
            join(root, 'CHANGELOG.md'),
            '# Changes\n\n## [Unreleased]\n\nFuture\n\n## [0.1.0] - 2026-11-05\n\n### Added\n\n- Authored notes.\n\n## [0.0.0]\n\nOlder\n\n[0.1.0]: https://example.com\n',
        );
        await git(root, 'init', '-q');
        await git(root, 'add', '.');
        await git(root, 'commit', '-qm', 'Fixture');
        const commit = await git(root, 'rev-parse', 'HEAD');
        await git(root, 'tag', 'v0.1.0');
        const output = join(root, 'packages');
        for (const target of targets) {
            await packageRelease(
                { target, version: '0.1.0', commit, output },
                root,
                async (_root, options, executable) => {
                    const binary = entries('0.1.0', options.target)[0];
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

function transport(failure?: 'existing' | 'create' | 'upload'): {
    calls: { url: string; method: string; body: unknown }[];
    fetcher: typeof fetch;
} {
    const calls: { url: string; method: string; body: unknown }[] = [];
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
            expect(mock.calls.length).toBe(14);
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
                },
            });
            expect(
                mock.calls.slice(2).map((call) => new URL(call.url).searchParams.get('name')),
            ).toEqual(
                targets.flatMap((target) => [
                    `coderail-${target}.zip`,
                    `coderail-${target}.zip.sha256`,
                ]),
            );
            expect(
                mock.calls
                    .slice(2)
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
