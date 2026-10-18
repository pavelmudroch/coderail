import { expect } from '@std/expect';
import { join } from '@std/path';
import { makeDirectory } from '../../src/fs/make-directory.ts';

Deno.test('Fs::makeDirectory creates a directory and preserves existing contents', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail');
    try {
        await makeDirectory(path);
        expect((await Deno.stat(path)).isDirectory).toBe(true);
        await Deno.writeTextFile(join(path, 'existing'), 'preserved');
        await makeDirectory(path);
        expect(await Deno.readTextFile(join(path, 'existing'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::makeDirectory rejects existing files', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail');
    try {
        await Deno.writeTextFile(path, 'preserved');
        await expect(makeDirectory(path)).rejects.toBeInstanceOf(Deno.errors.AlreadyExists);
        expect(await Deno.readTextFile(path)).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::makeDirectory creates missing parents', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'missing', 'child');
    try {
        await makeDirectory(path);
        expect((await Deno.stat(path)).isDirectory).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
