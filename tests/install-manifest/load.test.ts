import { expect } from '@std/expect';
import { join } from '@std/path';
import { InstallManifest } from '../../src/install-manifest.ts';
import { Fs } from '../../src/fs.ts';

Deno.test('InstallManifest.load preserves order and accepts empty and absent manifests', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'manifest.json');
    try {
        expect(await InstallManifest.load(path)).toBeNull();
        for (
            const files of [[], [
                { path: 'z/file', checksum: 'a'.repeat(64), size: 0 },
                { path: 'a', checksum: '0'.repeat(64), size: Number.MAX_SAFE_INTEGER },
            ]]
        ) {
            const manifest = { version: 1, files };
            await Deno.writeTextFile(path, JSON.stringify(manifest));
            expect(await InstallManifest.load(path)).toEqual(manifest);
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.load rejects malformed JSON and invalid schemas', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'manifest.json');
    try {
        for (
            const input of [
                '{',
                'null',
                '[]',
                '{}',
                '{"version":2,"files":[]}',
                '{"version":1,"files":{}}',
                '{"version":1,"files":[null]}',
                '{"version":1,"files":[],"root":"/tmp"}',
                '{"version":1,"files":[{"path":"a","checksum":"bad","size":0}]}',
            ]
        ) {
            await Deno.writeTextFile(path, input);
            await expect(InstallManifest.load(path)).rejects.toBeInstanceOf(Error);
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('InstallManifest.load propagates open and stream failures', async () => {
    const originalRead = Fs.read;
    try {
        for (const failure of [new Deno.errors.PermissionDenied('denied'), new Error('read')]) {
            Fs.read = (): never => {
                throw failure;
            };
            await expect(InstallManifest.load('manifest.json')).rejects.toBe(failure);
        }
        const failure = new Deno.errors.NotFound('stream failed');
        Fs.read = (() =>
            Promise.resolve(
                new ReadableStream<never>({
                    start(controller): void {
                        controller.error(failure);
                    },
                }),
            )) as typeof Fs.read;
        await expect(InstallManifest.load('manifest.json')).rejects.toBe(failure);
    } finally {
        Fs.read = originalRead;
    }
});
