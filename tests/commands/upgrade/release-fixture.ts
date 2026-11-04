import { expect } from '@std/expect';
import { crc32, deflateRawSync } from 'node:zlib';

const commit = 'a'.repeat(40);
const target = 'x86_64-unknown-linux-gnu';
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

export function entries(version = '2.10.0', platform = target): Entry[] {
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

export async function fixture(options: {
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
