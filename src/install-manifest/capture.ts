import { isAbsolute, relative, resolve, SEPARATOR } from '@std/path';
import type { Manifest, ManifestFile } from '../install-manifest.ts';
import { validatePath } from './validate.ts';

export async function canonicalRoot(root: string): Promise<string> {
    const canonical = await Deno.realPath(root);
    if (!(await Deno.lstat(canonical)).isDirectory) {
        throw new Error('Install manifest root must be a directory');
    }
    return canonical;
}

export function descendantPath(root: string, path: string): string {
    const target = resolve(root, path);
    const within = relative(root, target);
    if (isAbsolute(within) || within.split(SEPARATOR).includes('..')) {
        throw new Error('Install manifest path escapes root');
    }
    return target;
}

export async function regularFile(root: string, path: string): Promise<string> {
    const target = descendantPath(root, path);
    const parts = path.split('/');
    let current = root;
    for (const [index, part] of parts.entries()) {
        current = resolve(current, part);
        const info = await Deno.lstat(current);
        if (info.isSymlink) throw new Error('Install manifest path contains a symlink');
        if (index === parts.length - 1) {
            if (!info.isFile) throw new Error('Install manifest leaf must be a regular file');
        } else if (!info.isDirectory) {
            throw new Error('Install manifest ancestor must be a directory');
        }
    }
    return target;
}

export async function fingerprint(path: string): Promise<Pick<ManifestFile, 'checksum' | 'size'>> {
    const bytes = await Deno.readFile(path);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return {
        checksum: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        size: bytes.length,
    };
}

export async function capture(root: string, paths: string[]): Promise<Manifest> {
    const selected = new Set<string>();
    for (const path of paths) {
        validatePath(path);
        if (selected.has(path)) throw new Error('Duplicate install manifest path');
        selected.add(path);
    }
    const canonical = await canonicalRoot(root);
    const files: ManifestFile[] = [];
    for (const path of paths) {
        files.push({ path, ...await fingerprint(await regularFile(canonical, path)) });
    }
    return { version: 1, files };
}
