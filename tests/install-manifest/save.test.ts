import { expect } from '@std/expect';
import { join } from '@std/path';
import { InstallManifest, type Manifest } from '../../src/install-manifest.ts';
import { Fs } from '../../src/fs.ts';
import { tempContext } from '../../src/fs/temp/ctx.ts';

Deno.test('InstallManifest.save round trips ordered entries and empty manifests', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'manifest.json');
    try {
        for (
            const files of [[
                { path: 'z/é.md', checksum: 'abcdef0123456789'.repeat(4), size: 4 },
                { path: 'a', checksum: '0'.repeat(64), size: 0 },
            ], []]
        ) {
            const manifest: Manifest = { version: 1, files };
            await InstallManifest.save(path, manifest);
            expect(JSON.parse(await Deno.readTextFile(path))).toEqual(manifest);
            expect(await InstallManifest.load(path)).toEqual(manifest);
            await expect(Deno.stat(join(root, '.~manifest.json.lock'))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.save validates runtime inputs before writing', async () => {
    const file = { path: 'a', checksum: 'a'.repeat(64), size: 0 };
    const invalid: unknown[] = [
        null,
        undefined,
        [],
        new Date(),
        1,
        'manifest',
        {},
        { files: [] },
        { version: 1 },
        { version: 2, files: [] },
        { version: 1, files: [], root: '/tmp' },
        { version: 1, files: null },
        Object.assign(Object.create({}), { version: 1, files: [] }),
        { version: 1, files: [], [Symbol('extra')]: true },
        { version: 1, files: new Array(1) },
        ...[
            null,
            [],
            new Date(),
            {},
            { ...file, extra: true },
            Object.assign(Object.create({}), file),
            { ...file, [Symbol('extra')]: true },
            { checksum: file.checksum, size: 0 },
            { path: 'a', size: 0 },
            { path: 'a', checksum: file.checksum },
        ].map((entry) => ({ version: 1, files: [entry] })),
        { version: 1, files: [file, file] },
        ...[
            '',
            '/a',
            'C:a',
            'C:/a',
            '\\a',
            'a\\b',
            'a\0b',
            'a//b',
            'a/',
            '.',
            '..',
            './a',
            '../a',
            'a/./b',
            'a/../b',
            4,
            null,
        ].map((path) => ({ version: 1, files: [{ ...file, path }] })),
        ...[
            '',
            'a'.repeat(63),
            'a'.repeat(65),
            'A'.repeat(64),
            'g'.repeat(64),
            'a'.repeat(64) + '\n',
            null,
            1,
        ].map((checksum) => ({ version: 1, files: [{ ...file, checksum }] })),
        ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0', null]
            .map((size) => ({ version: 1, files: [{ ...file, size }] })),
    ];
    const root = await Deno.makeTempDir();
    const path = join(root, 'manifest.json');
    try {
        await Deno.writeTextFile(path, 'original');
        for (const value of invalid) {
            await expect(InstallManifest.save(path, value as Manifest)).rejects.toBeInstanceOf(
                Error,
            );
            expect(await Deno.readTextFile(path)).toBe('original');
        }
        expect(Array.from(Deno.readDirSync(root), (entry) => entry.name)).toEqual([
            'manifest.json',
        ]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.save preserves lock failures and cleans up failed staged writes', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'manifest.json');
    const lock = join(root, '.~manifest.json.lock');
    const manifest: Manifest = { version: 1, files: [] };
    try {
        await expect(InstallManifest.save(join(root, 'missing', 'manifest.json'), manifest))
            .rejects.toBeInstanceOf(Deno.errors.NotFound);
        await expect(Deno.stat(join(root, 'missing'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
        await Deno.writeTextFile(path, 'original');
        await Deno.writeTextFile(lock, 'other writer');
        await expect(InstallManifest.save(path, manifest)).rejects.toBeInstanceOf(
            Deno.errors.AlreadyExists,
        );
        await Fs.cleanup();
        expect(await Deno.readTextFile(path)).toBe('original');
        expect(await Deno.readTextFile(lock)).toBe('other writer');
        await Deno.remove(lock);
        await Deno.remove(path);
        await Deno.mkdir(path);
        await expect(InstallManifest.save(path, manifest)).rejects.toBeInstanceOf(Error);
        expect((await Deno.stat(path)).isDirectory).toBe(true);
        expect(JSON.parse(await Deno.readTextFile(lock))).toEqual(manifest);
        expect(tempContext.registeredResourcePaths).toContain(lock);
        await Fs.cleanup();
        await expect(Deno.stat(lock)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Fs.cleanup();
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.save propagates underlying write failures', async () => {
    const originalWrite = Fs.write;
    const failure = new Deno.errors.PermissionDenied('denied');
    try {
        Fs.write = (): never => {
            throw failure;
        };
        await expect(InstallManifest.save('manifest.json', { version: 1, files: [] }))
            .rejects.toBe(failure);
    } finally {
        Fs.write = originalWrite;
    }
});
