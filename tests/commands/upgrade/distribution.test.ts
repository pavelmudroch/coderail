import { expect } from '@std/expect';
import { join } from '@std/path';
import { crc32, deflateRawSync } from 'node:zlib';
import {
    resolveRelease,
    targetTriple,
    withStagedDistribution,
} from '../../../src/commands/upgrade/distribution.ts';

const commit = 'a'.repeat(40);
const target = 'x86_64-unknown-linux-gnu';
const name = `coderail-${target}.zip`;
const encoder = new TextEncoder();
type Entry = { name: string; data: Uint8Array; mode?: number; method?: number };

// Small deterministic ZIP fixtures: no subprocesses, network, or installed paths.
function zip(entries: Entry[]): Uint8Array<ArrayBuffer> {
    const locals: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
        const path = encoder.encode(entry.name);
        const method = entry.method ?? 0;
        const data = method === 8 ? deflateRawSync(entry.data) : entry.data;
        const local = new Uint8Array(30 + path.length + data.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true);
        l.setUint16(4, 20, true);
        l.setUint16(8, method, true);
        l.setUint32(14, crc32(entry.data), true);
        l.setUint32(18, data.length, true);
        l.setUint32(22, entry.data.length, true);
        l.setUint16(26, path.length, true);
        local.set(path, 30);
        local.set(data, 30 + path.length);
        const header = new Uint8Array(46 + path.length);
        const c = new DataView(header.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 0x0314, true);
        c.setUint16(6, 20, true);
        c.setUint16(10, method, true);
        c.setUint32(16, crc32(entry.data), true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, entry.data.length, true);
        c.setUint16(28, path.length, true);
        c.setUint32(38, (entry.mode ?? 0o100644) * 65536, true);
        c.setUint32(42, offset, true);
        header.set(path, 46);
        locals.push(local);
        central.push(header);
        offset += local.length;
    }
    const directory = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, directory, true);
    view.setUint32(16, offset, true);
    const result = new Uint8Array(offset + directory + 22);
    let position = 0;
    for (const item of [...locals, ...central, end]) {
        result.set(item, position);
        position += item.length;
    }
    return result;
}

function executable(os = 'linux', arch = 'x86_64'): Uint8Array {
    const bytes = new Uint8Array(128);
    const view = new DataView(bytes.buffer);
    if (os === 'linux') {
        bytes.set([127, 69, 76, 70, 2, 1]);
        view.setUint16(18, arch === 'x86_64' ? 62 : 183, true);
    } else if (os === 'darwin') {
        view.setUint32(0, 0xfeedfacf, true);
        view.setUint32(4, arch === 'x86_64' ? 0x01000007 : 0x0100000c, true);
    } else {
        bytes.set([77, 90]);
        view.setUint32(60, 64, true);
        view.setUint32(64, 0x4550, true);
        view.setUint16(68, arch === 'x86_64' ? 0x8664 : 0xaa64, true);
    }
    return bytes;
}

function entries(version = '2.10.0', platform = target): Entry[] {
    const os = platform.includes('windows')
        ? 'windows'
        : platform.includes('apple')
        ? 'darwin'
        : 'linux';
    return [
        { name: os === 'windows' ? 'cr.exe' : 'cr', data: executable(os, platform.split('-')[0]) },
        { name: 'instructions/a.md', data: encoder.encode('instruction'), method: 8 },
        { name: 'templates/default.md', data: encoder.encode('template') },
        {
            name: 'build.json',
            data: encoder.encode(
                JSON.stringify({ schemaVersion: 1, version, commit, target: platform }),
            ),
        },
    ];
}

function release(tag = 'v2.10.0', id = 1): Record<string, unknown> {
    return {
        id,
        tag_name: tag,
        draft: false,
        prerelease: tag === 'canary',
        target_commitish: commit,
        updated_at: 'today',
    };
}

// Bound mock traffic even when a mutation repeats or decrements the page number.
function recordRequest(calls: string[], input: Parameters<typeof fetch>[0]): URL {
    if (calls.length >= 100) throw new Error('Mock request limit exceeded');
    const url = new URL(String(input));
    calls.push(url.href);
    if (url.pathname.endsWith('/releases') || url.pathname.endsWith('/assets')) {
        const page = url.searchParams.get('page');
        if (page !== '1' && page !== '2') {
            throw new Error(`Unexpected page for ${url.pathname}: ${page}`);
        }
    }
    return url;
}

async function fixture(options: {
    entries?: Entry[];
    archive?: Uint8Array;
    releases?: Record<string, unknown>[];
    platform?: string;
    checksum?: string;
} = {}): Promise<
    {
        fetcher: typeof fetch;
        calls: string[];
        release: Record<string, unknown>;
        assets: Record<string, unknown>[];
    }
> {
    const archive = options.archive ?? zip(options.entries ?? entries());
    const assetName = `coderail-${options.platform ?? target}.zip`;
    const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(archive))),
        (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const checksum = encoder.encode(options.checksum ?? `${hash}  ${assetName}\n`);
    const selected = options.releases?.[0] ?? release();
    const assets = [
        { id: 10, name: assetName, size: archive.length, updated_at: 'today', state: 'uploaded' },
        {
            id: 11,
            name: `${assetName}.sha256`,
            size: checksum.length,
            updated_at: 'today',
            state: 'uploaded',
        },
    ];
    const calls: string[] = [];
    const fetcher: typeof fetch = (input, init): Promise<Response> => {
        const requestUrl = recordRequest(calls, input);
        const url = requestUrl.href;
        const page = requestUrl.searchParams.get('page');
        expect(url.startsWith('https://api.github.com/repos/pavelmudroch/coderail/')).toBe(true);
        if (url.endsWith('/releases/assets/10')) {
            expect(new Headers(init?.headers).get('Accept')).toBe('application/octet-stream');
            return Promise.resolve(new Response(new Uint8Array(archive)));
        }
        if (url.endsWith('/releases/assets/11')) return Promise.resolve(new Response(checksum));
        if (url.includes('/assets?')) {
            return Promise.resolve(Response.json(page === '1' ? assets : []));
        }
        if (url.includes('/releases?')) {
            return Promise.resolve(
                Response.json(page === '1' ? options.releases ?? [selected] : []),
            );
        }
        return Promise.resolve(Response.json(selected));
    };
    return { fetcher, calls, release: selected, assets };
}

Deno.test('release selectors use semantic stable ordering, including explicit downgrades', async () => {
    const releases = [
        release('v1.9.0', 1),
        release('v2.9.9', 2),
        release('v2.10.0', 3),
        release('v2.10.1-rc.1', 4),
        { ...release('v9.0.0', 5), prerelease: true },
        { ...release('v8.0.0', 6), draft: true },
    ];
    for (
        const [selector, version] of [
            [undefined, '2.10.0'],
            ['latest', '2.10.0'],
            ['2', '2.10.0'],
            ['v2', '2.10.0'],
            ['2.9', '2.9.9'],
            ['v2.9', '2.9.9'],
            ['1.9.0', '1.9.0'],
            ['v1.9.0', '1.9.0'],
        ]
    ) {
        const f = await fixture({ releases });
        const resolved = await resolveRelease({ version: selector }, target, f.fetcher);
        expect(resolved.version).toBe(version);
        expect(resolved.commit).toBe(commit);
        expect(resolved.archive.name).toBe(name);
    }
});

Deno.test('resolution paginates releases and assets', async () => {
    const f = await fixture();
    const calls: string[] = [];
    const fetcher: typeof fetch = (input, init) => {
        const requestUrl = recordRequest(calls, input);
        const url = requestUrl.href;
        const page = requestUrl.searchParams.get('page');
        if (url.includes('/releases?') && page === '1') {
            return Promise.resolve(
                Response.json(Array.from({ length: 100 }, (_, i) => release('v1.0.0', i + 2))),
            );
        }
        if (url.includes('/releases?') && page === '2') {
            return Promise.resolve(Response.json([release()]));
        }
        if (url.includes('/assets?') && page === '1') {
            return Promise.resolve(
                Response.json(
                    Array.from(
                        { length: 100 },
                        (_, i) => ({
                            id: i + 100,
                            name: `other${i}`,
                            size: 1,
                            state: 'uploaded',
                            updated_at: 'today',
                        }),
                    ),
                ),
            );
        }
        if (url.includes('/assets?') && page === '2') {
            return Promise.resolve(Response.json(f.assets));
        }
        return f.fetcher(input, init);
    };
    expect((await resolveRelease({}, target, fetcher)).version).toBe('2.10.0');
});

Deno.test('resolution stops at empty pages after exactly 100 releases and assets', async () => {
    const f = await fixture({
        releases: Array.from({ length: 100 }, (_, i) => release('v2.10.0', i + 1)),
    });
    const assets = [
        ...f.assets,
        ...Array.from({ length: 98 }, (_, i) => ({
            id: i + 100,
            name: `other${i}`,
            size: 1,
            state: 'uploaded',
            updated_at: 'today',
        })),
    ];
    const calls: string[] = [];
    const fetcher: typeof fetch = (input, init) => {
        const url = recordRequest(calls, input);
        if (url.pathname.endsWith('/assets')) {
            return Promise.resolve(
                Response.json(url.searchParams.get('page') === '1' ? assets : []),
            );
        }
        return f.fetcher(input, init);
    };
    const resolved = await resolveRelease({}, target, fetcher);
    expect(resolved.version).toBe('2.10.0');
    expect(resolved.archive).toEqual(f.assets[0]);
    expect(resolved.checksum).toEqual(f.assets[1]);
    for (const endpoint of ['/releases', '/assets']) {
        const pages = calls.map((url) => new URL(url))
            .filter((url) => url.pathname.endsWith(endpoint))
            .map((url) => url.searchParams.get('page'));
        expect(pages).toEqual(['1', '2']);
    }
});

Deno.test('canary pins commit and all six platforms stage and clean up', async () => {
    for (const os of ['linux', 'darwin', 'windows']) {
        for (const arch of ['x86_64', 'aarch64']) {
            const platform = targetTriple(os, arch);
            const f = await fixture({
                releases: [release('canary')],
                entries: entries('canary', platform),
                platform,
            });
            const resolved = await resolveRelease({ canary: true }, platform, f.fetcher);
            expect(resolved.version).toBe('canary');
            let staged = '';
            await withStagedDistribution(resolved, async (stage) => {
                staged = stage.root;
                expect(stage.build).toEqual({
                    schemaVersion: 1,
                    version: 'canary',
                    commit,
                    target: platform,
                });
                expect(await Deno.readFile(stage.executable)).toEqual(executable(os, arch));
                expect(await Deno.readTextFile(join(stage.instructions, 'a.md'))).toBe(
                    'instruction',
                );
                expect(await Deno.readTextFile(join(stage.templates, 'default.md'))).toBe(
                    'template',
                );
            }, f.fetcher);
            await expect(Deno.stat(staged)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        }
    }
});

Deno.test('resolution rejects unsupported targets, invalid selectors, missing and malformed publications', async () => {
    const f = await fixture();
    expect(() => targetTriple('freebsd', 'x86_64')).toThrow();
    expect(() => targetTriple('linux', 'riscv64')).toThrow();
    await expect(resolveRelease({}, 'bad', f.fetcher)).rejects.toThrow();
    for (const version of ['', 'v', '01', '1.02', '1.2.03', '1.2.3.4', '1.2.3-rc', 'no']) {
        await expect(resolveRelease({ version }, target, f.fetcher)).rejects.toThrow();
    }
    await expect(resolveRelease({ version: 'latest', canary: true }, target, f.fetcher)).rejects
        .toThrow();
    for (const releases of [[], [release('v1.0.0-rc')], [release('v1.0.0')]]) {
        const missing = await fixture({ releases });
        await expect(resolveRelease({ version: '3' }, target, missing.fetcher)).rejects.toThrow();
    }
    for (
        const mutate of [
            (f: Awaited<ReturnType<typeof fixture>>): void => {
                f.assets.pop();
            },
            (f: Awaited<ReturnType<typeof fixture>>): void => {
                f.assets.push({ ...f.assets[0] });
            },
            (f: Awaited<ReturnType<typeof fixture>>): void => {
                (f.assets[0] as Record<string, unknown>).state = 'new';
            },
            (f: Awaited<ReturnType<typeof fixture>>): void => {
                f.release.target_commitish = 'main';
            },
        ]
    ) {
        const invalid = await fixture();
        mutate(invalid);
        await expect(resolveRelease({}, target, invalid.fetcher)).rejects.toThrow();
    }
    for (
        const fetcher of [
            (() => Promise.reject(new Error('offline'))) as typeof fetch,
            (() => Promise.resolve(new Response('missing', { status: 404 }))) as typeof fetch,
            (() => Promise.resolve(Response.json({}))) as typeof fetch,
        ]
    ) await expect(resolveRelease({}, target, fetcher)).rejects.toThrow();
});

Deno.test('package failures preserve installation and remove staging, including callback failures', async () => {
    const installed = await Deno.makeTempDir();
    await Deno.writeTextFile(join(installed, 'cr'), 'installed');
    try {
        const badEntries = [
            [],
            entries().slice(1),
            entries().filter((e) => !e.name.startsWith('instructions/')),
            entries().filter((e) => !e.name.startsWith('templates/')),
            entries().filter((e) => e.name !== 'build.json'),
            entries('3.0.0'),
            entries().map((e) =>
                e.name === 'cr' ? { ...e, data: encoder.encode('bad executable') } : e
            ),
            entries().map((e) =>
                e.name === 'build.json' ? { ...e, data: encoder.encode('{}') } : e
            ),
            entries().map((e) => e.name === 'build.json' ? { ...e, data: encoder.encode('{') } : e),
            entries().map((e) =>
                e.name.startsWith('instructions') ? { ...e, data: new Uint8Array() } : e
            ),
        ];
        for (
            const path of [
                '../escape',
                '/absolute',
                'C:/absolute',
                'instructions/../escape',
                'instructions\\escape',
                'templates/a:stream',
                'templates/NUL.txt',
                'templates/a.',
                'templates/a//b',
                'templates/./b',
                'templates/\0x',
                'assets/a',
                'templates/é',
            ]
        ) {
            badEntries.push([...entries(), { name: path, data: encoder.encode('bad') }]);
        }
        for (
            const extra of [
                { name: 'cr', data: executable() },
                { name: 'templates/DEFAULT.md', data: encoder.encode('collision') },
                { name: 'templates/default.md/child', data: encoder.encode('collision') },
                { name: 'templates/link', data: encoder.encode('../../escape'), mode: 0o120777 },
            ]
        ) badEntries.push([...entries(), extra]);
        for (const fixtureEntries of badEntries) {
            const f = await fixture({ entries: fixtureEntries });
            const resolved = await resolveRelease({}, target, f.fetcher);
            await expect(withStagedDistribution(resolved, () => Promise.resolve(), f.fetcher))
                .rejects.toThrow();
        }
        for (
            const options of [{ archive: new Uint8Array([1, 2, 3]) }, {
                checksum: `${'0'.repeat(64)}  ${name}\n`,
            }, { checksum: 'invalid' }]
        ) {
            const f = await fixture(options);
            const resolved = await resolveRelease({}, target, f.fetcher);
            await expect(withStagedDistribution(resolved, () => Promise.resolve(), f.fetcher))
                .rejects.toThrow();
        }
        const f = await fixture();
        const resolved = await resolveRelease({}, target, f.fetcher);
        let root = '';
        await expect(withStagedDistribution(resolved, (stage) => {
            root = stage.root;
            return Promise.reject(new Error('consumer failed'));
        }, f.fetcher)).rejects.toThrow('consumer failed');
        await expect(Deno.stat(root)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        expect(await Deno.readTextFile(join(installed, 'cr'))).toBe('installed');
        expect(Array.from(Deno.readDirSync(installed)).map((e) => e.name)).toEqual(['cr']);
    } finally {
        await Deno.remove(installed, { recursive: true });
    }
});

Deno.test('changing canary publication and download failures abort before consuming staging', async () => {
    for (const change of ['release', 'commit', 'asset', 'size', 'download']) {
        const f = await fixture({ releases: [release('canary')], entries: entries('canary') });
        const resolved = await resolveRelease({ canary: true }, target, f.fetcher);
        if (change === 'release') f.release.id = 2;
        if (change === 'commit') f.release.target_commitish = 'b'.repeat(40);
        if (change === 'asset') (f.assets[0] as Record<string, unknown>).id = 20;
        if (change === 'size') resolved.archive.size++;
        const fetcher = change === 'download'
            ? (() => Promise.reject(new Error('download'))) as typeof fetch
            : f.fetcher;
        let called = false;
        await expect(withStagedDistribution(resolved, () => {
            called = true;
            return Promise.resolve();
        }, fetcher)).rejects.toThrow();
        expect(called).toBe(false);
    }
});

Deno.test('explicit directories, permissions, semantic patch ordering, and callback return values', async () => {
    const f = await fixture({
        entries: [
            { name: 'instructions/', data: new Uint8Array(), mode: 0o40755 },
            { name: 'templates/', data: new Uint8Array(), mode: 0 },
            ...entries(),
        ],
    });
    const resolved = await resolveRelease({}, target, f.fetcher);
    expect(
        await withStagedDistribution(resolved, async (stage) => {
            if (Deno.build.os !== 'windows') {
                expect(((await Deno.stat(stage.executable)).mode ?? 0) & 0o777).toBe(0o755);
            }
            return 42;
        }, f.fetcher),
    ).toBe(42);
    const ordered = await fixture({
        releases: [release('2.10.0'), release('2.10.1'), release('2.10.1'), release('2.10.0')],
    });
    expect((await resolveRelease({}, target, ordered.fetcher)).version).toBe('2.10.1');
});

Deno.test('corrupt ZIP records, compression, checksums, and file types are rejected and cleaned', async () => {
    const good = zip(entries());
    const end = good.length - 22;
    const central = new DataView(good.buffer).getUint32(end + 16, true);
    const mutations: [number, number, number][] = [
        [end, 4, 0],
        [end + 4, 2, 1],
        [end + 6, 2, 1],
        [end + 8, 2, 1],
        [end + 10, 2, 0],
        [end + 10, 2, 10001],
        [end + 12, 4, 0],
        [end + 16, 4, 0],
        [end + 20, 2, 1],
        [central, 4, 0],
        [central + 8, 2, 1],
        [central + 10, 2, 99],
        [central + 16, 4, 0],
        [central + 20, 4, good.length],
        [central + 24, 4, 0xffffffff],
        [central + 28, 2, 500],
        [central + 30, 2, 1],
        [central + 32, 2, 1],
        [central + 34, 2, 1],
        [central + 38, 4, 0o020644 * 65536],
        [central + 42, 4, 1],
        [0, 4, 0],
        [6, 2, 1],
        [8, 2, 8],
        [14, 4, 0],
        [18, 4, 0],
        [22, 4, 0],
        [26, 2, 0],
        [28, 2, 0xffff],
        [30, 1, 65],
        [32, 1, 0],
        [33, 1, 0],
    ];
    const archives = mutations.map(([offset, width, value]) => {
        const archive = good.slice();
        const view = new DataView(archive.buffer);
        if (width === 4) view.setUint32(offset, value, true);
        else if (width === 2) view.setUint16(offset, value, true);
        else view.setUint8(offset, value);
        return archive;
    });
    // Change CRC in both headers, so validation must inspect expanded bytes.
    const badCrc = good.slice();
    new DataView(badCrc.buffer).setUint32(14, 0, true);
    new DataView(badCrc.buffer).setUint32(central + 16, 0, true);
    archives.push(
        badCrc,
        zip([
            { name: 'instructions/', data: encoder.encode('not empty'), mode: 0o40755 },
            ...entries(),
        ]),
    );
    const originalTemp = Deno.makeTempDir;
    const roots: string[] = [];
    Deno.makeTempDir = async (options): Promise<string> => {
        const root = await originalTemp(options);
        roots.push(root);
        return root;
    };
    try {
        for (const archive of archives) {
            const f = await fixture({ archive });
            const resolved = await resolveRelease({}, target, f.fetcher);
            await expect(withStagedDistribution(resolved, () => Promise.resolve(), f.fetcher))
                .rejects.toThrow();
        }
        for (const root of roots) {
            await expect(Deno.stat(root)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        }
    } finally {
        Deno.makeTempDir = originalTemp;
        for (const root of roots) {
            await Deno.remove(root, { recursive: true }).catch((error: unknown) => {
                expect(error).toBeInstanceOf(Deno.errors.NotFound);
            });
        }
    }
});

Deno.test('metadata identity and executable headers must match selected build', async () => {
    for (
        const data of [
            { schemaVersion: 2, version: '2.10.0', commit, target },
            { schemaVersion: 1, version: '2.10.0', commit: 'b'.repeat(40), target },
            { schemaVersion: 1, version: '2.10.0', commit, target: 'aarch64-unknown-linux-gnu' },
            null,
        ]
    ) {
        const f = await fixture({
            entries: entries().map((e) =>
                e.name === 'build.json' ? { ...e, data: encoder.encode(JSON.stringify(data)) } : e
            ),
        });
        const resolved = await resolveRelease({}, target, f.fetcher);
        await expect(withStagedDistribution(resolved, () => Promise.resolve(), f.fetcher)).rejects
            .toThrow();
    }
    for (const os of ['linux', 'darwin', 'windows']) {
        const platform = targetTriple(os, 'x86_64');
        const good = executable(os);
        const offsets = os === 'linux'
            ? [0, 1, 2, 3, 4, 5, 18]
            : os === 'darwin'
            ? [0, 4]
            : [0, 1, 60, 64, 68];
        for (const offset of offsets) {
            const bad = good.slice();
            bad[offset] = 0;
            const f = await fixture({
                platform,
                entries: entries('2.10.0', platform).map((e) =>
                    e.name === (os === 'windows' ? 'cr.exe' : 'cr') ? { ...e, data: bad } : e
                ),
            });
            const resolved = await resolveRelease({}, platform, f.fetcher);
            await expect(withStagedDistribution(resolved, () => Promise.resolve(), f.fetcher))
                .rejects.toThrow();
        }
    }
});

Deno.test('streamed assets and larger compressed resources retain every byte', async () => {
    const large = new Uint8Array(2 * 1024 * 1024).fill(65);
    const f = await fixture({
        entries: entries().map((entry) =>
            entry.name === 'instructions/a.md' ? { ...entry, data: large } : entry
        ),
    });
    const resolved = await resolveRelease({}, target, f.fetcher);
    const streaming: typeof fetch = async (input, init): Promise<Response> => {
        const response = await f.fetcher(input, init);
        if (!String(input).includes('/releases/assets/')) return response;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return new Response(
            new ReadableStream<Uint8Array>({
                start(controller): void {
                    for (let offset = 0; offset < bytes.length; offset += 7) {
                        controller.enqueue(bytes.slice(offset, offset + 7));
                    }
                    controller.close();
                },
            }),
        );
    };
    await withStagedDistribution(resolved, async (stage) => {
        const actual = await Deno.readFile(join(stage.instructions, 'a.md'));
        expect(actual.length).toBe(large.length);
        expect(new Uint8Array(await crypto.subtle.digest('SHA-256', actual))).toEqual(
            new Uint8Array(await crypto.subtle.digest('SHA-256', large)),
        );
    }, streaming);
    // Resolving a large asset only reads metadata, never allocates its payload.
    const asset = f.assets[0] as Record<string, unknown>;
    asset.size = 2 * 1024 * 1024;
    expect((await resolveRelease({}, target, f.fetcher)).archive.size).toBe(2 * 1024 * 1024);
    asset.size = 512 * 1024 * 1024 + 1;
    await expect(resolveRelease({}, target, f.fetcher)).rejects.toThrow(
        'Missing or invalid release asset',
    );
});
