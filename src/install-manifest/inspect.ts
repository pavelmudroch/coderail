import { resolve } from '@std/path';
import type { Inspection, Manifest, ManifestFile } from '../install-manifest.ts';
import { canonicalRoot, descendantPath, fingerprint } from './capture.ts';
import { validate } from './validate.ts';

async function inspectFile(root: string, file: ManifestFile): Promise<Inspection['status']> {
    const target = descendantPath(root, file.path);
    const parts = file.path.split('/');
    let current = root;
    for (const [index, part] of parts.entries()) {
        current = resolve(current, part);
        let info: Deno.FileInfo;
        try {
            info = await Deno.lstat(current);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) return 'missing';
            throw error;
        }
        if (index === parts.length - 1) {
            if (!info.isFile) return 'modified';
        } else {
            if (info.isSymlink) throw new Error('Install manifest path contains a symlink');
            if (!info.isDirectory) {
                throw new Error('Install manifest ancestor must be a directory');
            }
        }
    }
    const actual = await fingerprint(target);
    return actual.size === file.size && actual.checksum === file.checksum
        ? 'unchanged'
        : 'modified';
}

export async function inspect(root: string, manifest: Manifest): Promise<Inspection[]> {
    validate(manifest);
    const canonical = await canonicalRoot(root);
    const results: Inspection[] = [];
    for (const file of manifest.files) {
        results.push({ path: file.path, status: await inspectFile(canonical, file) });
    }
    return results;
}
