import { expect } from '@std/expect';
import { join } from '@std/path';
import { InstallManifest, type Manifest } from '../../src/install-manifest.ts';

Deno.test('InstallManifest.inspect preserves ordered baselines and installed edits through persistence', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, 'nested'));
        await Deno.mkdir(join(root, 'kept'));
        const paths = [
            'same',
            'longer',
            'equal',
            'absent',
            'nested/file',
            'empty',
            'binary',
            'kept/file',
        ];
        for (const path of paths) await Deno.writeTextFile(join(root, path), 'hello');
        await Deno.writeTextFile(join(root, 'empty'), '');
        await Deno.writeFile(join(root, 'binary'), new Uint8Array([0, 255, 128]));
        const manifest = await InstallManifest.capture(root, paths);
        const baseline = structuredClone(manifest);
        const storage = join(root, 'manifest.json');
        await InstallManifest.save(storage, manifest);
        const saved = await Deno.readTextFile(storage);
        await Deno.writeTextFile(join(root, 'longer'), 'hello world');
        await Deno.writeTextFile(join(root, 'equal'), 'HELLO');
        await Deno.remove(join(root, 'absent'));
        await Deno.remove(join(root, 'nested'), { recursive: true });
        await Deno.writeTextFile(join(root, 'unlisted'), 'ignored');
        expect(await InstallManifest.inspect(root, manifest)).toEqual([
            { path: 'same', status: 'unchanged' },
            { path: 'longer', status: 'modified' },
            { path: 'equal', status: 'modified' },
            { path: 'absent', status: 'missing' },
            { path: 'nested/file', status: 'missing' },
            { path: 'empty', status: 'unchanged' },
            { path: 'binary', status: 'unchanged' },
            { path: 'kept/file', status: 'unchanged' },
        ]);
        const differentSize = structuredClone(manifest);
        differentSize.files = differentSize.files.map((file) => ({ ...file, size: file.size + 1 }));
        expect((await InstallManifest.inspect(root, differentSize))[0]).toEqual({
            path: 'same',
            status: 'modified',
        });
        expect(await InstallManifest.inspect(root, { version: 1, files: [] })).toEqual([]);
        expect(
            await InstallManifest.inspect(root, (await InstallManifest.load(storage)) as Manifest),
        )
            .toEqual(await InstallManifest.inspect(root, baseline));
        expect(manifest).toEqual(baseline);
        expect(await Deno.readTextFile(storage)).toBe(saved);
        expect(await Deno.readTextFile(join(root, 'longer'))).toBe('hello world');
        expect(await Deno.readTextFile(join(root, 'equal'))).toBe('HELLO');
        expect(await Deno.readTextFile(join(root, 'unlisted'))).toBe('ignored');
        expect(await Deno.readTextFile(join(root, 'same'))).toBe('hello');
        expect(await Deno.readTextFile(join(root, 'kept/file'))).toBe('hello');
        expect(await Deno.readFile(join(root, 'empty'))).toEqual(new Uint8Array());
        expect(await Deno.readFile(join(root, 'binary'))).toEqual(new Uint8Array([0, 255, 128]));
        await expect(Deno.lstat(join(root, 'absent'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
        await expect(Deno.lstat(join(root, 'nested'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.inspect reports non-regular leaves without reading or following them', async () => {
    const root = await Deno.makeTempDir();
    const originalRead = Deno.readFile;
    const originalLstat = Deno.lstat;
    try {
        const paths = ['directory', 'live', 'dangling', 'other'];
        for (const path of paths) await Deno.writeTextFile(join(root, path), 'hello');
        const manifest = await InstallManifest.capture(root, paths);
        for (const path of paths) await Deno.remove(join(root, path));
        await Deno.mkdir(join(root, 'directory'));
        await Deno.symlink(join(root, 'other'), join(root, 'live'));
        await Deno.symlink(join(root, 'absent'), join(root, 'dangling'));
        await Deno.writeTextFile(join(root, 'other'), 'fixture');
        Deno.lstat = ((path: string | URL) =>
            String(path).endsWith('/other')
                ? Promise.resolve(
                    { isFile: false, isDirectory: false, isSymlink: false } as Deno.FileInfo,
                )
                : originalLstat(path)) as typeof Deno.lstat;
        Deno.readFile = (): never => {
            throw new Error('unexpected leaf read');
        };
        expect(await InstallManifest.inspect(root, manifest)).toEqual(
            paths.map((path) => ({ path, status: 'modified' })),
        );
    } finally {
        Deno.readFile = originalRead;
        Deno.lstat = originalLstat;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.inspect rejects invalid runtime manifests before filesystem access', async () => {
    const file = { path: 'file', checksum: 'a'.repeat(64), size: 0 };
    const originalRealPath = Deno.realPath;
    let accesses = 0;
    try {
        Deno.realPath = (): never => {
            accesses++;
            throw new Error('unexpected root access');
        };
        const invalid: unknown[] = [
            null,
            undefined,
            [],
            {},
            { version: 2, files: [] },
            { version: 1, files: [], extra: true },
            { version: 1, files: null },
            { version: 1, files: [file, file] },
            ...[null, {}, { ...file, extra: true }, { ...file, checksum: 'A'.repeat(64) }, {
                ...file,
                size: -1,
            }, { ...file, size: 0.5 }]
                .map((entry) => ({ version: 1, files: [entry] })),
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
                '../root-sibling/file',
                4,
                null,
            ]
                .map((path) => ({ version: 1, files: [file, { ...file, path }] })),
        ];
        for (const manifest of invalid) {
            await expect(InstallManifest.inspect('root', manifest as Manifest)).rejects
                .toBeInstanceOf(Error);
        }
        expect(accesses).toBe(0);
    } finally {
        Deno.realPath = originalRealPath;
    }
});

Deno.test('InstallManifest.inspect rejects unsafe ancestors and invalid roots but accepts root aliases', async () => {
    const root = await Deno.makeTempDir();
    const originalLstat = Deno.lstat;
    try {
        await Deno.writeTextFile(join(root, 'file'), 'hello');
        await Deno.symlink(root, join(root, 'alias'));
        await Deno.symlink(join(root, 'absent'), join(root, 'dangling'));
        const manifest = await InstallManifest.capture(root, ['file']);
        expect(await InstallManifest.inspect(join(root, 'alias'), manifest)).toEqual([
            { path: 'file', status: 'unchanged' },
        ]);
        const canonical = await Deno.realPath(root);
        const visited: string[] = [];
        Deno.lstat = ((path: string | URL) => {
            visited.push(String(path));
            return originalLstat(path);
        }) as typeof Deno.lstat;
        for (const path of ['alias/file', 'dangling/file', 'file/child']) {
            visited.length = 0;
            await expect(InstallManifest.inspect(root, {
                version: 1,
                files: [{ ...manifest.files[0], path } as Manifest['files'][number]],
            })).rejects.toBeInstanceOf(Error);
            expect(visited).toEqual([canonical, join(canonical, path.split('/')[0] as string)]);
        }
        for (const path of ['absent', 'file', 'dangling']) {
            await expect(InstallManifest.inspect(join(root, path), { version: 1, files: [] }))
                .rejects.toBeInstanceOf(Error);
        }
    } finally {
        Deno.lstat = originalLstat;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.inspect propagates root, descendant access, and read failures', async () => {
    const root = await Deno.makeTempDir();
    const originalRead = Deno.readFile;
    const originalLstat = Deno.lstat;
    const originalRealPath = Deno.realPath;
    try {
        await Deno.writeTextFile(join(root, 'file'), 'hello');
        const manifest = await InstallManifest.capture(root, ['file']);
        const failure = new Deno.errors.PermissionDenied('denied');
        Deno.realPath = (): never => {
            throw failure;
        };
        await expect(InstallManifest.inspect(root, { version: 1, files: [] })).rejects.toBe(
            failure,
        );
        Deno.realPath = originalRealPath;
        Deno.lstat = (): never => {
            throw failure;
        };
        await expect(InstallManifest.inspect(root, { version: 1, files: [] })).rejects.toBe(
            failure,
        );
        Deno.lstat = ((path: string | URL) => {
            if (String(path).endsWith('/file')) throw failure;
            return originalLstat(path);
        }) as typeof Deno.lstat;
        await expect(InstallManifest.inspect(root, manifest)).rejects.toBe(failure);
        Deno.lstat = originalLstat;
        for (const error of [failure, new Deno.errors.NotFound('disappeared during read')]) {
            Deno.readFile = (): never => {
                throw error;
            };
            await expect(InstallManifest.inspect(root, manifest)).rejects.toBe(error);
        }
    } finally {
        Deno.readFile = originalRead;
        Deno.lstat = originalLstat;
        Deno.realPath = originalRealPath;
        await Deno.remove(root, { recursive: true });
    }
});
