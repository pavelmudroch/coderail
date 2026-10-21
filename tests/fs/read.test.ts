import { expect } from '@std/expect';
import { join } from '@std/path';
import { Fs } from '../../src/fs.ts';
import { read } from '../../src/fs/read.ts';

Deno.test('Fs::read streams file contents to completion', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'document.md');
    try {
        await Deno.writeTextFile(path, 'héllo world');
        const stream = await Fs.read(path);
        expect(await new Response(stream).text()).toBe('héllo world');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::read allows cancellation before completion', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'document.md');
    try {
        await Deno.writeTextFile(path, 'content');
        const stream = await read(path);
        await stream.cancel();
        expect((await stream.getReader().read()).done).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::read decodes text and preserves explicit binary contents', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'document.md');
    try {
        const text = 'héllo world 🌍';
        const bytes = new TextEncoder().encode(text);
        await Deno.writeFile(path, bytes);

        const textStream = await read(path, { text: true });
        let content = '';
        for await (const chunk of textStream) {
            expect(typeof chunk).toBe('string');
            content += chunk;
        }
        expect(content).toBe(text);

        const binaryStream = await read(path, { binary: true });
        expect(new Uint8Array(await new Response(binaryStream).arrayBuffer())).toEqual(bytes);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Fs::read rejects missing files', async () => {
    const root = await Deno.makeTempDir();
    try {
        await expect(read(join(root, 'missing.md'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
