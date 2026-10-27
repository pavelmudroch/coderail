import { basename, dirname, isAbsolute, join, normalize, parse } from '@std/path';
import { validatePath } from '../install-manifest/validate.ts';

export async function stat(path: string): Promise<Deno.FileInfo | null> {
    try {
        return await Deno.lstat(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
    }
}

/** Existing home aliases are permitted; missing home ancestors must be ordinary directories. */
export async function homePath(home: string, manifest: string): Promise<string> {
    if (
        !isAbsolute(home) || !isAbsolute(manifest) ||
        dirname(manifest) !== normalize(home) || basename(manifest) === '.'
    ) throw new Error('Expected absolute home and a manifest directly under home');
    const info = await stat(home);
    if (info) {
        const canonical = await Deno.realPath(home);
        if (!(await Deno.lstat(canonical)).isDirectory) throw new Error('Home must be a directory');
        return canonical;
    }
    const root = parse(home).root;
    await directoryPath(root, home.slice(root.length).split('/').filter(Boolean));
    return normalize(home);
}

export async function directoryPath(root: string, parts: string[]): Promise<void> {
    let current = root;
    for (const part of parts) {
        current = join(current, part);
        const info = await stat(current);
        if (!info) return;
        if (!info.isDirectory || info.isSymlink) throw new Error(`Unsafe directory: ${current}`);
    }
}

export async function leaf(root: string, path: string): Promise<Deno.FileInfo | null> {
    validatePath(path);
    const parts = path.split('/');
    await directoryPath(root, parts.slice(0, -1));
    const info = await stat(join(root, path));
    if (info && (!info.isFile || info.isSymlink)) throw new Error(`Unsafe file: ${path}`);
    return info;
}

export function validatePaths(paths: string[], manifestName: string): void {
    const seen = new Set<string>();
    for (const path of paths) {
        validatePath(path);
        if (path === manifestName || path.startsWith(`${manifestName}/`)) {
            throw new Error(`Reserved manifest path: ${path}`);
        }
        if (seen.has(path)) throw new Error(`Duplicate output: ${path}`);
        seen.add(path);
    }
    for (const path of paths) {
        const parts = path.split('/');
        parts.pop();
        while (parts.length) {
            if (seen.has(parts.join('/'))) throw new Error(`File ancestor collision: ${path}`);
            parts.pop();
        }
    }
}
