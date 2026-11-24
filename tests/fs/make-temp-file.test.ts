import { Fs } from '@fs';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { makeTempFile } from '../../src/fs/make-temp-file.ts';

Deno.test(
    'Fs::makeTempFile retains a relative path’s location after changing directories',
    async () => {
        const cwd = Deno.cwd();
        const directory = await Deno.makeTempDir();
        const first = join(directory, 'first');
        const second = join(directory, 'second');
        try {
            await Deno.mkdir(first);
            await Deno.mkdir(second);
            Deno.chdir(first);
            const explicit = await makeTempFile('release.lock');
            const fallback = await makeTempFile('cleanup.lock');
            expect(explicit.path).toBe('release.lock');
            expect(fallback.path).toBe('cleanup.lock');
            expect(await Deno.readTextFile('release.lock')).toBe('');
            expect(await Deno.readTextFile('cleanup.lock')).toBe('');

            Deno.chdir(second);
            await Deno.writeTextFile('release.lock', 'other owner');
            await Deno.writeTextFile('cleanup.lock', 'other owner');
            await explicit.remove();
            await Fs.cleanup();
            for (const name of ['release.lock', 'cleanup.lock']) {
                await expect(Deno.stat(join(first, name))).rejects.toBeInstanceOf(
                    Deno.errors.NotFound,
                );
                expect(await Deno.readTextFile(name)).toBe('other owner');
            }
        } finally {
            Deno.chdir(cwd);
            await Fs.cleanup();
            await Deno.remove(directory, { recursive: true });
        }
    },
);

Deno.test(
    'Fs::makeTempFile creates exactly the requested empty file and releases it once',
    async () => {
        const directory = await Deno.makeTempDir();
        const path = join(directory, 'requested.lock');
        try {
            const first = await makeTempFile(path);
            expect(first.path).toBe(path);
            expect((await Deno.stat(path)).isFile).toBe(true);
            expect(await Deno.readTextFile(path)).toBe('');
            await Deno.writeTextFile(path, 'first owner');
            await expect(makeTempFile(path)).rejects.toBeInstanceOf(Deno.errors.AlreadyExists);
            expect(await Deno.readTextFile(path)).toBe('first owner');

            await Promise.all([first.remove(), first.remove()]);
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            const second = await makeTempFile(path);
            await Deno.writeTextFile(path, 'second owner');
            await first.remove();
            expect(await Deno.readTextFile(path)).toBe('second owner');
            await second.remove();

            await Deno.writeTextFile(path, 'external owner');
            await Fs.cleanup();
            expect(await Deno.readTextFile(path)).toBe('external owner');
        } finally {
            await Fs.cleanup();
            await Deno.remove(directory, { recursive: true });
        }
    },
);

Deno.test(
    'Fs::makeTempFile cleanup removes owned files and preserves contended files',
    async () => {
        const directory = await Deno.makeTempDir();
        const path = join(directory, 'owned.lock');
        const other = join(directory, 'other.lock');
        try {
            await Deno.writeTextFile(other, 'other owner');
            await expect(makeTempFile(other)).rejects.toBeInstanceOf(Deno.errors.AlreadyExists);
            const file = await makeTempFile(path);

            await Fs.cleanup();
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect(await Deno.readTextFile(other)).toBe('other owner');

            await Deno.writeTextFile(path, 'next owner');
            await file.remove();
            await Fs.cleanup();
            expect(await Deno.readTextFile(path)).toBe('next owner');
        } finally {
            await Fs.cleanup();
            await Deno.remove(directory, { recursive: true });
        }
    },
);

Deno.test('Fs::makeTempFile can be cleaned after a failed release', async () => {
    const directory = await Deno.makeTempDir();
    const path = join(directory, 'owned.lock');
    const remove = Deno.remove;
    try {
        const file = await makeTempFile(path);
        const denied = new Deno.errors.PermissionDenied('release denied');
        Deno.remove = (target, options) =>
            target === path ? Promise.reject(denied) : remove(target, options);
        await expect(file.remove()).rejects.toBe(denied);
        expect((await Deno.stat(path)).isFile).toBe(true);

        Deno.remove = remove;
        await Fs.cleanup();
        await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        Deno.remove = remove;
        await Fs.cleanup();
        await Deno.remove(directory, { recursive: true });
    }
});

Deno.test('Fs::makeTempFile release tolerates an already absent file', async () => {
    const directory = await Deno.makeTempDir();
    const path = join(directory, 'removed.lock');
    try {
        const file = await makeTempFile(path);
        await Deno.remove(path);
        await file.remove();
        await Deno.writeTextFile(path, 'new owner');
        await Fs.cleanup();
        expect(await Deno.readTextFile(path)).toBe('new owner');
    } finally {
        await Fs.cleanup();
        await Deno.remove(directory, { recursive: true });
    }
});
