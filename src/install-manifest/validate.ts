import type { Manifest } from '../install-manifest.ts';

function hasProperties(value: unknown, properties: string[]): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    return keys.length === properties.length &&
        properties.every((property) => Object.hasOwn(value, property));
}

export function validatePath(path: unknown): asserts path is string {
    if (
        typeof path !== 'string' || path.includes('\\') || path.includes('\0') ||
        /^[a-z]:/i.test(path) ||
        path.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
        throw new Error('Invalid install manifest path');
    }
}

export function validate(value: unknown): asserts value is Manifest {
    if (
        !hasProperties(value, ['version', 'files']) || value.version !== 1 ||
        !Array.isArray(value.files)
    ) {
        throw new Error('Invalid install manifest');
    }
    const paths = new Set<string>();
    for (const file of value.files) {
        if (
            !hasProperties(file, ['path', 'checksum', 'size']) ||
            typeof file.checksum !== 'string' ||
            file.checksum.length !== 64 || !/^[0-9a-f]+$/.test(file.checksum) ||
            typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0
        ) {
            throw new Error('Invalid install manifest file');
        }
        validatePath(file.path);
        if (paths.has(file.path)) throw new Error('Duplicate install manifest path');
        paths.add(file.path);
    }
}
