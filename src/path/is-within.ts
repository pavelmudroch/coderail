import { dirname, isAbsolute, join, normalize } from '@std/path';

export function isWithin(path: string, root: string): boolean {
    if (path === '' || root === '') {
        return false;
    }

    const normalizedPath = isAbsolute(path) ? normalize(path) : join(Deno.cwd(), path);
    const normalizedRoot = isAbsolute(root) ? normalize(root) : join(Deno.cwd(), root);
    let normalizedPathDirectory = dirname(normalizedPath);
    if (!normalizedPathDirectory.endsWith('/')) {
        normalizedPathDirectory += '/';
    }

    return normalizedPathDirectory.startsWith(normalizedRoot);
}
