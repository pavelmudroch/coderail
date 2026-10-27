import { expect } from '@std/expect';
import { join } from '@std/path';
import { regularFile } from '../../src/install-manifest/capture.ts';
import { InstallManifest } from '../../src/install-manifest.ts';

Deno.test('InstallManifest.capture fingerprints selected bytes in order without changing files', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, 'nested'));
        const fixtures = [
            {
                path: 'empty',
                bytes: new Uint8Array(),
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            },
            {
                path: 'nested/text',
                bytes: new TextEncoder().encode('hello'),
                checksum: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
            },
            {
                path: 'binary',
                bytes: new Uint8Array([0, 255, 128]),
                checksum: 'f742b965f156c10374bc23aea96e3a8aff8facd6fc079defeaa30219ad86f211',
            },
        ];
        for (const file of fixtures) await Deno.writeFile(join(root, file.path), file.bytes);
        await Deno.writeTextFile(join(root, 'unlisted'), 'excluded');
        const selected = fixtures.toReversed();
        expect(await InstallManifest.capture(root, selected.map((file) => file.path))).toEqual({
            version: 1,
            files: selected.map((file) => ({
                path: file.path,
                size: file.bytes.length,
                checksum: file.checksum,
            })),
        });
        expect(await InstallManifest.capture(root, [])).toEqual({ version: 1, files: [] });
        for (const file of fixtures) {
            expect(await Deno.readFile(join(root, file.path))).toEqual(file.bytes);
        }
        expect(await Deno.readTextFile(join(root, 'unlisted'))).toBe('excluded');
        expect(Array.from(Deno.readDirSync(root), (entry) => entry.name).sort()).toEqual([
            'binary',
            'empty',
            'nested',
            'unlisted',
        ]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.capture validates the entire selection before reading files', async () => {
    const root = await Deno.makeTempDir();
    const originalRead = Deno.readFile;
    let reads = 0;
    try {
        await Deno.writeTextFile(join(root, 'first'), 'selected');
        Deno.readFile = (): never => {
            reads++;
            throw new Error('unexpected read');
        };
        for (
            const path of [
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
                `../${root.split('/').pop()}-sibling/file`,
                4,
                null,
            ]
        ) {
            await expect(InstallManifest.capture(root, ['first', path as string])).rejects
                .toBeInstanceOf(Error);
        }
        await expect(InstallManifest.capture(root, ['first', 'first'])).rejects.toBeInstanceOf(
            Error,
        );
        expect(reads).toBe(0);
    } finally {
        Deno.readFile = originalRead;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.capture rejects unsafe descendants and accepts root aliases', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, 'directory'));
        await Deno.writeTextFile(join(root, 'file'), 'hello');
        await Deno.symlink(join(root, 'file'), join(root, 'live'));
        await Deno.symlink(join(root, 'absent'), join(root, 'dangling'));
        await Deno.symlink(join(root, 'directory'), join(root, 'ancestor'));
        await Deno.symlink(root, join(root, 'alias'));
        for (
            const path of [
                'missing',
                'directory',
                'live',
                'dangling',
                'ancestor/file',
                'dangling/file',
                'file/child',
            ]
        ) {
            await expect(InstallManifest.capture(root, [path])).rejects.toBeInstanceOf(Error);
        }
        expect(await InstallManifest.capture(join(root, 'alias'), ['file'])).toEqual(
            await InstallManifest.capture(root, ['file']),
        );
        for (
            const invalidRoot of [join(root, 'missing'), join(root, 'file'), join(root, 'dangling')]
        ) {
            await expect(InstallManifest.capture(invalidRoot, [])).rejects.toBeInstanceOf(Error);
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.capture preserves filesystem failures and never traverses symlinks', async () => {
    const root = await Deno.makeTempDir();
    const originalRead = Deno.readFile;
    const originalLstat = Deno.lstat;
    const originalRealPath = Deno.realPath;
    try {
        await Deno.writeTextFile(join(root, 'file'), 'hello');
        await Deno.symlink(root, join(root, 'link'));
        const visited: string[] = [];
        Deno.lstat = ((path: string | URL) => {
            visited.push(String(path));
            return originalLstat(path);
        }) as typeof Deno.lstat;
        await expect(InstallManifest.capture(root, ['link/file'])).rejects.toBeInstanceOf(Error);
        expect(visited).toEqual([
            await Deno.realPath(root),
            join(await Deno.realPath(root), 'link'),
        ]);
        Deno.lstat = originalLstat;
        const failure = new Deno.errors.PermissionDenied('denied');
        Deno.readFile = (): never => {
            throw failure;
        };
        await expect(InstallManifest.capture(root, ['file'])).rejects.toBe(failure);
        Deno.readFile = originalRead;
        Deno.lstat = ((path: string | URL) => {
            if (String(path).endsWith('/file')) throw failure;
            return originalLstat(path);
        }) as typeof Deno.lstat;
        await expect(InstallManifest.capture(root, ['file'])).rejects.toBe(failure);
        Deno.lstat = originalLstat;
        Deno.realPath = (): never => {
            throw failure;
        };
        await expect(InstallManifest.capture(root, [])).rejects.toBe(failure);
        Deno.realPath = originalRealPath;
        Deno.lstat = ((path: string | URL) =>
            String(path).endsWith('/file')
                ? Promise.resolve(
                    { isFile: false, isDirectory: false, isSymlink: false } as Deno.FileInfo,
                )
                : originalLstat(path)) as typeof Deno.lstat;
        await expect(InstallManifest.capture(root, ['file'])).rejects.toBeInstanceOf(Error);
    } finally {
        Deno.readFile = originalRead;
        Deno.lstat = originalLstat;
        Deno.realPath = originalRealPath;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('capture containment rejects sibling paths sharing the root prefix', async () => {
    const root = await Deno.makeTempDir();
    try {
        await expect(regularFile(root, `../${root.split('/').pop()}-sibling/file`))
            .rejects.toBeInstanceOf(Error);
        await expect(regularFile(root, '..')).rejects.toBeInstanceOf(Error);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
