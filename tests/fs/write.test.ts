import { expect } from '@std/expect';
import { join } from '@std/path';
import { write } from '../../src/fs/write.ts';
import { cleanupTempResources } from '../../src/fs/temp/cleanup-temp-resources.ts';
import { tempContext } from '../../src/fs/temp/ctx.ts';

function content(...chunks: (Uint8Array | string)[]): ReadableStream<Uint8Array | string> {
    return new ReadableStream({
        start(controller): void {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
}

Deno.test('Fs::write stages mixed content, replaces the target, and unregisters the lock', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'coderail.conf');
    const lock = join(root, '.~coderail.conf.lock');
    try {
        await Deno.writeTextFile(path, 'original');
        await write(path, content('héllo', new TextEncoder().encode(' world')));
        expect(await Deno.readTextFile(path)).toBe('héllo world');
        await expect(Deno.stat(lock)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        expect(tempContext.registeredResourcePaths).not.toContain(lock);
        await Deno.writeTextFile(lock, 'another process');
        await cleanupTempResources();
        expect(await Deno.readTextFile(lock)).toBe('another process');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::write rejects an existing lock without registering or modifying it', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'coderail.conf');
    const lock = join(root, '.~coderail.conf.lock');
    try {
        await Deno.writeTextFile(path, 'original');
        await Deno.writeTextFile(lock, 'another process');
        await expect(write(path, content('replacement'))).rejects.toBeInstanceOf(
            Deno.errors.AlreadyExists,
        );
        expect(tempContext.registeredResourcePaths).not.toContain(lock);
        await cleanupTempResources();
        expect(await Deno.readTextFile(path)).toBe('original');
        expect(await Deno.readTextFile(lock)).toBe('another process');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::write preserves the target on stream failure and leaves the lock for cleanup', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'coderail.conf');
    const lock = join(root, '.~coderail.conf.lock');
    const failure = new Error('stream failed');
    try {
        await Deno.writeTextFile(path, 'original');
        const stream = new ReadableStream<Uint8Array | string>({
            start(controller): void {
                controller.error(failure);
            },
        });
        await expect(write(path, stream)).rejects.toBe(failure);
        expect(await Deno.readTextFile(path)).toBe('original');
        expect(tempContext.registeredResourcePaths).toContain(lock);
        await cleanupTempResources();
        await expect(Deno.stat(lock)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        tempContext.registeredResourcePaths.length = 0;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::write retains a failed rename lock for cleanup', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'coderail.conf');
    const lock = join(root, '.~coderail.conf.lock');
    try {
        await Deno.mkdir(path);
        await expect(write(path, content('replacement'))).rejects.toBeInstanceOf(Error);
        expect((await Deno.stat(path)).isDirectory).toBe(true);
        expect(await Deno.readTextFile(lock)).toBe('replacement');
        expect(tempContext.registeredResourcePaths).toContain(lock);
        await cleanupTempResources();
        await expect(Deno.stat(lock)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        tempContext.registeredResourcePaths.length = 0;
        await Deno.remove(root, { recursive: true });
    }
});
