import { expect } from '@std/expect';
import { join } from '@std/path';

import { Templates } from '../../src/templates.ts';

const signal = new AbortController().signal;
Deno.test(
    'catalog scaffolds, sorts, inspects, escapes metadata and removes templates',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            expect(await Templates.list(root, signal)).toEqual([]);
            const description = 'Quotes " and \\ slash\nnew line';
            const z = await Templates.create(root, 'z', description, signal);
            const a = await Templates.create(root, 'a', '', signal);
            expect(z).toEqual({ name: 'z', description, path: join(root, 'templates', 'z') });
            expect(await Templates.get(root, 'z', signal)).toEqual(z);
            expect(await Templates.list(root, signal)).toEqual([a, z]);
            expect(
                await Array.fromAsync(Deno.readDir(a.path)).then((entries) =>
                    entries.map((e) => e.name).sort(),
                ),
            ).toEqual(['assets', 'config', 'template']);
            expect(await Deno.readTextFile(join(a.path, 'config'))).toBe('');
            await expect(Templates.create(root, 'z', 'replace', signal)).rejects.toThrow();
            expect(await Templates.get(root, 'z', signal)).toEqual(z);
            await Deno.writeTextFile(join(a.path, 'template'), '');
            expect((await Templates.get(root, 'a', signal)).description).toBe('');
            expect(await Templates.delete(root, 'z', signal)).toEqual(z);
            await expect(Templates.get(root, 'z', signal)).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
Deno.test('catalog rejects invalid names, layouts, metadata and cancellation', async () => {
    const root = await Deno.makeTempDir();
    try {
        for (const name of ['', '.', '..', '../x', 'a/b', 'a\\b', '/absolute', 'C:drive', '\0']) {
            await expect(Templates.create(root, name, '', signal)).rejects.toThrow();
            await expect(Templates.get(root, name, signal)).rejects.toThrow();
            await expect(Templates.delete(root, name, signal)).rejects.toThrow();
        }
        const info = await Templates.create(root, 'broken', '', signal);
        for (const content of [
            'description = 1',
            'other = "value"',
            'description = [',
            '[description]\nx = 1',
        ]) {
            await Deno.writeTextFile(join(info.path, 'template'), content);
            await expect(Templates.get(root, 'broken', signal)).rejects.toThrow();
        }
        await Deno.writeTextFile(join(info.path, 'template'), 'description = "ok"');
        for (const name of ['config', 'assets', 'template']) {
            const path = join(info.path, name);
            await Deno.remove(path, { recursive: true });
            await expect(Templates.list(root, signal)).rejects.toThrow();
            if (name === 'assets') {
                await Deno.writeTextFile(path, '');
            } else {
                await Deno.mkdir(path);
            }
            await expect(Templates.get(root, 'broken', signal)).rejects.toThrow();
            await Deno.remove(path, { recursive: true });
            if (name === 'assets') {
                await Deno.mkdir(path);
            } else {
                await Deno.writeTextFile(path, '');
            }
        }
        await Deno.symlink(info.path, join(root, 'templates', 'link'), { type: 'dir' });
        await expect(Templates.get(root, 'link', signal)).rejects.toThrow();
        await Deno.remove(join(root, 'templates', 'link'));
        await Deno.writeTextFile(join(root, 'templates', 'file'), '');
        expect((await Templates.list(root, signal)).length).toBe(1);
        const cancelled = AbortSignal.abort();
        await expect(Templates.list(root, cancelled)).rejects.toThrow();
        await expect(Templates.get(root, 'broken', cancelled)).rejects.toThrow();
        await expect(Templates.create(root, 'new', '', cancelled)).rejects.toThrow();
        await expect(Templates.delete(root, 'broken', cancelled)).rejects.toThrow();
        await Deno.remove(join(root, 'templates'), { recursive: true });
        await Deno.writeTextFile(join(root, 'templates'), '');
        await expect(Templates.list(root, signal)).rejects.toThrow();
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('creation stops subsequent writes when cancelled during scaffolding', async () => {
    const root = await Deno.makeTempDir();
    const saved = Deno.mkdir;
    const controller = new AbortController();
    Deno.mkdir = async (path, options): Promise<void> => {
        await saved(path, options);
        controller.abort();
    };
    try {
        await expect(Templates.create(root, 'cancelled', '', controller.signal)).rejects.toThrow();
        expect(await Array.fromAsync(Deno.readDir(join(root, 'templates')))).toEqual([]);
    } finally {
        Deno.mkdir = saved;
        await Deno.remove(root, { recursive: true });
    }
});
