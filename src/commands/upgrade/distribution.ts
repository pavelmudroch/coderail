import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Release consumption contract (publisher workflows are deliberately separate).
 *
 * Repository: pavelmudroch/coderail. Stable tags are v?X.Y.Z; canary is the
 * dedicated `canary` prerelease. target_commitish MUST be a full lowercase SHA-1,
 * never a moving branch. Publish only after all six platform builds are ready.
 * Each release attaches coderail-<Deno target>.zip and <archive>.sha256 containing
 * exactly `<lowercase SHA-256>  <archive name>\n` (sha256sum format).
 *
 * ZIP roots contain cr (cr.exe on Windows) and build.json. Optional instructions/
 * and templates/ roots may be absent or empty, representing empty resource sets.
 * build.json is {schemaVersion:1,version:"X.Y.Z"|"canary",commit:"<40 hex>",
 * target:"<Deno target>"}. Canary identity is its full commit, not just "canary".
 * Archives use classic single-disk ZIP, stored or deflated entries, UTF-8/ASCII
 * names, no encryption, data descriptors, ZIP64, or links. Paths use portable
 * ASCII names; case collisions, Windows reserved names, and extra root entries
 * are rejected on every platform. Explicit directory records are optional.
 * Limit: 512 MiB download, 1 GiB expanded, 10000 entries; resources must be
 * nonempty regular files. Executable format/architecture headers are checked.
 * See https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT and
 * https://docs.github.com/en/rest/releases/releases .
 *
 * Resolve once, download by immutable asset ID, verify checksum/build identity,
 * and recheck the publication before exposing staging. No installation paths
 * are accepted. A callback scopes staging lifetime: success and failure both
 * remove it. Consumers must finish using/copying staged files inside callback.
 */
import { dirname, join } from '@std/path';

const API = 'https://api.github.com/repos/pavelmudroch/coderail';
const MAX_DOWNLOAD = 512 * 1024 * 1024;
const MAX_EXPANDED = 1024 * 1024 * 1024;
const TARGETS = [
    'x86_64-unknown-linux-gnu',
    'aarch64-unknown-linux-gnu',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-pc-windows-msvc',
    'aarch64-pc-windows-msvc',
];

type Asset = { id: number; name: string; size: number; updated_at: string; state: string };
type Release = {
    id: number;
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    target_commitish: string;
    updated_at: string;
};
export type Build = { schemaVersion: 1; version: string; commit: string; target: string };
export type ResolvedRelease = {
    version: string;
    commit: string;
    target: string;
    archive: Asset;
    checksum: Asset;
    publication: Release;
};
export type StagedDistribution = {
    root: string;
    executable: string;
    instructions: string;
    templates: string;
    build: Build;
};

function requireValid(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

export function targetTriple(os: string, arch: string): string {
    const suffix: Record<string, string> = {
        linux: 'unknown-linux-gnu',
        darwin: 'apple-darwin',
        windows: 'pc-windows-msvc',
    };
    requireValid(
        Object.hasOwn(suffix, os) && ['x86_64', 'aarch64'].includes(arch),
        'Unsupported upgrade platform',
    );
    return `${arch}-${suffix[os]}`;
}

async function request(path: string, fetcher: typeof fetch, binary = false): Promise<Response> {
    const response = await fetcher(`${API}${path}`, {
        headers: { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' },
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`GitHub request failed (${response.status}): ${path}`);
    }
    return response;
}

async function list<T>(path: string, fetcher: typeof fetch): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
        const items: unknown = await (
            await request(`${path}?per_page=100&page=${page}`, fetcher)
        ).json();
        requireValid(Array.isArray(items), 'Invalid GitHub list response');
        all.push(...items);
        if (items.length < 100) {
            return all;
        }
    }
}

function inspectPublication(value: Release): Release {
    requireValid(
        value &&
            Number.isSafeInteger(value.id) &&
            value.id > 0 &&
            typeof value.tag_name === 'string' &&
            value.draft === false &&
            typeof value.prerelease === 'boolean' &&
            typeof value.updated_at === 'string' &&
            /^[0-9a-f]{40}$/.test(value.target_commitish),
        'Invalid release publication identity',
    );
    // Copy only identity fields: download counters and other mutable API fields
    // must not cause false publication-race reports.
    return {
        id: value.id,
        tag_name: value.tag_name,
        draft: value.draft,
        prerelease: value.prerelease,
        target_commitish: value.target_commitish,
        updated_at: value.updated_at,
    };
}

function selectAsset(assets: Asset[], name: string): Asset {
    const matches = assets.filter((asset) => asset?.name === name);
    const asset = matches[0];
    requireValid(
        matches.length === 1 &&
            asset &&
            Number.isSafeInteger(asset.id) &&
            asset.id > 0 &&
            Number.isSafeInteger(asset.size) &&
            asset.size > 0 &&
            asset.size <= MAX_DOWNLOAD &&
            typeof asset.updated_at === 'string' &&
            asset.state === 'uploaded',
        `Missing or invalid release asset: ${name}`,
    );
    return {
        id: asset.id,
        name: asset.name,
        size: asset.size,
        updated_at: asset.updated_at,
        state: asset.state,
    };
}

export async function resolveRelease(
    selection: { version?: string; canary?: boolean },
    target: string,
    fetcher: typeof fetch = fetch,
): Promise<ResolvedRelease> {
    requireValid(TARGETS.includes(target), 'Unsupported upgrade target');
    let selected: Release;
    let version: string;
    if (selection.canary) {
        selected = inspectPublication(
            await (await request('/releases/tags/canary', fetcher)).json(),
        );
        requireValid(
            selected.tag_name === 'canary' && selected.prerelease,
            'Invalid canary release',
        );
        version = 'canary';
    } else {
        const selector = selection.version ?? 'latest';
        const parts = selector.replace(/^v/, '').split('.');
        const candidates = (await list<Release>('/releases', fetcher)).filter(
            (release) =>
                release &&
                release.draft === false &&
                release.prerelease === false &&
                /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(release.tag_name) &&
                (selector === 'latest' ||
                    parts.every(
                        (part, i) => release.tag_name.replace(/^v/, '').split('.')[i] === part,
                    )),
        );
        candidates.sort((a, b) => {
            const left = a.tag_name.replace(/^v/, '').split('.').map(BigInt) as [
                bigint,
                bigint,
                bigint,
            ];
            const right = b.tag_name.replace(/^v/, '').split('.').map(BigInt) as [
                bigint,
                bigint,
                bigint,
            ];
            for (const i of [0, 1, 2] as const) {
                if (left[i] !== right[i]) {
                    return left[i] > right[i] ? -1 : 1;
                }
            }
            return 0;
        });
        requireValid(candidates[0], `No stable release matches ${selector}`);
        selected = inspectPublication(candidates[0]);
        version = selected.tag_name.replace(/^v/, '');
    }
    const assets = await list<Asset>(`/releases/${selected.id}/assets`, fetcher);
    const name = `coderail-${target}.zip`;
    return {
        version,
        commit: selected.target_commitish,
        target,
        archive: selectAsset(assets, name),
        checksum: selectAsset(assets, `${name}.sha256`),
        publication: selected,
    };
}

async function download(asset: Asset, fetcher: typeof fetch): Promise<Uint8Array> {
    const response = await request(`/releases/assets/${asset.id}`, fetcher, true);
    requireValid(response.body, 'Empty asset response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
            requireValid(size <= asset.size, 'Release asset size changed');
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    requireValid(size === asset.size, 'Incomplete release asset');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}

type ZipEntry = { path: string; directory: boolean; data: Uint8Array };

function safePath(name: string): string {
    const path = name.endsWith('/') ? name.slice(0, -1) : name;
    requireValid(
        path
            .split('/')
            .every(
                (part) =>
                    /^[A-Za-z0-9_. -]+$/.test(part) &&
                    !['.', '..'].includes(part) &&
                    !/[. ]$/.test(part) &&
                    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
            ),
        'Unsafe archive path',
    );
    requireValid(
        path === 'cr' ||
            path === 'cr.exe' ||
            path === 'build.json' ||
            path === 'instructions' ||
            path.startsWith('instructions/') ||
            path === 'templates' ||
            path.startsWith('templates/'),
        'Unexpected archive root',
    );
    return path;
}

function readZip(bytes: Uint8Array): ZipEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (at: number): number => view.getUint16(at, true);
    const u32 = (at: number): number => view.getUint32(at, true);
    const end = bytes.length - 22;
    requireValid(
        end >= 0 &&
            u32(end) === 0x06054b50 &&
            u16(end + 20) === 0 &&
            u32(end + 4) === 0 &&
            u16(end + 8) === u16(end + 10),
        'Invalid ZIP end record',
    );
    const count = u16(end + 10);
    let central = u32(end + 16);
    requireValid(
        count > 0 && count <= 10000 && central + u32(end + 12) === end,
        'Invalid ZIP directory',
    );
    let local = 0;
    let expanded = 0;
    const entries: ZipEntry[] = [];
    const paths = new Map<string, { path: string; directory: boolean }>();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (let i = 0; i < count; i++) {
        requireValid(
            u32(central) === 0x02014b50 &&
                u16(central + 34) === 0 &&
                (u16(central + 8) & ~0x800) === 0,
            'Unsupported ZIP entry',
        );
        const method = u16(central + 10);
        const size = u32(central + 24);
        const compressed = u32(central + 20);
        const length = u16(central + 28);
        const name = decoder.decode(bytes.subarray(central + 46, central + 46 + length));
        const path = safePath(name);
        const directory = name.endsWith('/');
        const mode = (u32(central + 38) >>> 16) & 0xf000;
        requireValid(
            mode === 0 || mode === (directory ? 0x4000 : 0x8000),
            'ZIP links and special files are forbidden',
        );
        const key = path.toLowerCase();
        requireValid(!paths.has(key), 'Duplicate archive destination');
        paths.set(key, { path, directory });
        requireValid(
            u32(central + 42) === local &&
                u32(local) === 0x04034b50 &&
                u16(local + 6) === u16(central + 8) &&
                u16(local + 8) === method &&
                u32(local + 14) === u32(central + 16) &&
                u32(local + 18) === compressed &&
                u32(local + 22) === size &&
                u16(local + 26) === length &&
                decoder.decode(bytes.subarray(local + 30, local + 30 + length)) === name,
            'Mismatched ZIP headers',
        );
        const start = local + 30 + length + u16(local + 28);
        local = start + compressed;
        requireValid(local <= u32(end + 16), 'Overlapping ZIP entries');
        expanded += size;
        requireValid(
            expanded <= MAX_EXPANDED && (method === 0 || method === 8),
            'Unsupported or oversized ZIP',
        );
        const input = bytes.subarray(start, local);
        const data =
            method === 0 ? input : inflateRawSync(input, { maxOutputLength: Math.max(1, size) });
        requireValid(
            data.length === size && crc32(data) === u32(central + 16) && (!directory || size === 0),
            'Corrupt ZIP content',
        );
        entries.push({ path, directory, data });
        central += 46 + length + u16(central + 30) + u16(central + 32);
    }
    requireValid(central === end && local === u32(end + 16), 'Malformed ZIP layout');
    for (const entry of entries) {
        const parts = entry.path.split('/');
        for (let i = 1; i < parts.length; i++) {
            const parent = parts.slice(0, i).join('/');
            const existing = paths.get(parent.toLowerCase());
            requireValid(
                !existing || (existing.directory && existing.path === parent),
                'Archive path collision',
            );
            paths.set(parent.toLowerCase(), { path: parent, directory: true });
        }
    }
    return entries;
}

function validateExecutable(bytes: Uint8Array, target: string): void {
    requireValid(bytes.length >= 64, 'Invalid executable');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const x64 = target.startsWith('x86_64-');
    let valid: boolean;
    if (target.includes('linux')) {
        valid =
            bytes[0] === 127 &&
            bytes[1] === 69 &&
            bytes[2] === 76 &&
            bytes[3] === 70 &&
            bytes[4] === 2 &&
            bytes[5] === 1 &&
            view.getUint16(18, true) === (x64 ? 62 : 183);
    } else if (target.includes('apple')) {
        valid =
            view.getUint32(0, true) === 0xfeedfacf &&
            view.getUint32(4, true) === (x64 ? 0x01000007 : 0x0100000c);
    } else {
        const pe = view.getUint32(60, true);
        valid =
            bytes[0] === 77 &&
            bytes[1] === 90 &&
            pe >= 64 &&
            pe + 6 <= bytes.length &&
            view.getUint32(pe, true) === 0x4550 &&
            view.getUint16(pe + 4, true) === (x64 ? 0x8664 : 0xaa64);
    }
    requireValid(valid, 'Executable format or architecture mismatch');
}

export async function withStagedDistribution<T>(
    resolved: ResolvedRelease,
    consume: (stage: StagedDistribution) => Promise<T>,
    fetcher: typeof fetch = fetch,
): Promise<T> {
    const root = await Deno.makeTempDir({ prefix: 'coderail-upgrade-' });
    try {
        const archive = await download(resolved.archive, fetcher);
        const checksum = new TextDecoder().decode(await download(resolved.checksum, fetcher));
        const hash = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(archive))),
            (byte) => byte.toString(16).padStart(2, '0'),
        ).join('');
        requireValid(
            checksum === `${hash}  ${resolved.archive.name}\n`,
            'Archive SHA-256 mismatch',
        );
        const entries = readZip(archive);
        const binaryName = resolved.target.includes('windows') ? 'cr.exe' : 'cr';
        const binary = entries.find((entry) => entry.path === binaryName && !entry.directory);
        const metadata = entries.find((entry) => entry.path === 'build.json' && !entry.directory);
        requireValid(binary && metadata, 'Missing executable or build.json');
        requireValid(
            !entries.some((entry) => entry.path === (binaryName === 'cr' ? 'cr.exe' : 'cr')),
            'Unexpected executable',
        );
        validateExecutable(binary.data, resolved.target);
        const build: Build = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(metadata.data),
        );
        requireValid(
            build &&
                build.schemaVersion === 1 &&
                build.version === resolved.version &&
                build.commit === resolved.commit &&
                build.target === resolved.target,
            'Build metadata mismatch',
        );
        for (const resource of ['instructions', 'templates']) {
            requireValid(
                !entries.some(
                    (entry) =>
                        !entry.directory &&
                        (entry.path === resource ||
                            (entry.path.startsWith(`${resource}/`) && entry.data.length === 0)),
                ),
                'Invalid resource content',
            );
        }
        const current = inspectPublication(
            await (
                await request(`/releases/tags/${resolved.publication.tag_name}`, fetcher)
            ).json(),
        );
        const assets = await list<Asset>(`/releases/${current.id}/assets`, fetcher);
        requireValid(
            JSON.stringify(current) === JSON.stringify(resolved.publication) &&
                JSON.stringify(selectAsset(assets, resolved.archive.name)) ===
                    JSON.stringify(resolved.archive) &&
                JSON.stringify(selectAsset(assets, resolved.checksum.name)) ===
                    JSON.stringify(resolved.checksum),
            'Release publication changed during download',
        );
        for (const entry of entries) {
            const path = join(root, entry.path);
            if (entry.directory) {
                await Deno.mkdir(path, { recursive: true });
            } else {
                await Deno.mkdir(dirname(path), { recursive: true });
                await Deno.writeFile(path, entry.data, {
                    createNew: true,
                    mode: entry.path === binaryName ? 0o755 : 0o644,
                });
            }
        }
        return await consume({
            root,
            executable: join(root, binaryName),
            instructions: join(root, 'instructions'),
            templates: join(root, 'templates'),
            build,
        });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}
