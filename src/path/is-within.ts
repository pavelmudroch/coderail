import { dirname, isAbsolute, join, normalize, SEPARATOR } from '@std/path';

export function isWithin(path: string, root: string): boolean {
    const isDir = path.endsWith(SEPARATOR);
    const normalizedPath = isAbsolute(path) ? normalize(path) : join(Deno.cwd(), path);
    const normalizedRoot = isAbsolute(root) ? normalize(root) : join(Deno.cwd(), root);
    let normalizedPathDirectory = isDir ? normalizedPath : dirname(normalizedPath);
    if (!normalizedPathDirectory.endsWith(SEPARATOR)) {
        normalizedPathDirectory += SEPARATOR;
    }

    return normalizedPathDirectory.startsWith(normalizedRoot);
}
