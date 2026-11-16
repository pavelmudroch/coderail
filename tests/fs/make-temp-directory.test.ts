import { expect } from '@std/expect';
import { dirname, isAbsolute, join, relative } from '@std/path';

import { makeTempDirectory } from '../../src/fs/make-temp-directory.ts';
import { cleanupTempResources } from '../../src/fs/temp/cleanup-temp-resources.ts';
import { tempContext } from '../../src/fs/temp/ctx.ts';

Deno.test(
    'Fs::makeTempDirectory uses an absolute project temp path and cleans only owned directories',
    async () => {
        const root = await Deno.makeTempDir({ prefix: 'project with spaces-' });
        const parent = join(root, '.coderail', '.tmp');
        try {
            const first = await makeTempDirectory(relative(Deno.cwd(), root));
            const second = await makeTempDirectory(root);
            expect(isAbsolute(first.path)).toBe(true);
            expect(dirname(first.path)).toBe(parent);
            expect(dirname(second.path)).toBe(parent);
            expect(first.path).not.toBe(second.path);
            expect(tempContext.registeredResourcePaths).toContain(first.path);
            expect(tempContext.registeredResourcePaths).toContain(second.path);
            const directory = await first.addDirectory('nested/child');
            expect(directory).toBe(join(first.path, 'nested', 'child'));
            expect((await Deno.stat(directory)).isDirectory).toBe(true);
            const file = await first.addFile('root.txt', new Blob(['root']).stream());
            expect(file).toBe(join(first.path, 'root.txt'));
            expect(await Deno.readTextFile(file)).toBe('root');
            const nested = await first.addFile(
                'other/mixed.txt',
                new ReadableStream({
                    start(controller): void {
                        controller.enqueue('héllo');
                        controller.enqueue(new TextEncoder().encode(' world'));
                        controller.close();
                    },
                }),
            );
            expect(nested).toBe(join(first.path, 'other', 'mixed.txt'));
            expect(await Deno.readTextFile(nested)).toBe('héllo world');
            const unrelated = join(parent, 'another-process');
            await Deno.writeTextFile(unrelated, 'preserved');
            await cleanupTempResources();
            await expect(Deno.stat(first.path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await expect(Deno.stat(second.path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect(await Deno.readTextFile(unrelated)).toBe('preserved');
        } finally {
            tempContext.registeredResourcePaths.length = 0;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('Fs::makeTempDirectory preserves Deno defaults without a known project', async () => {
    const original = Deno.makeTempDir;
    let options: Deno.MakeTempOptions | undefined;
    Deno.makeTempDir = (value) => {
        options = value;
        return original(value);
    };
    try {
        const directory = await makeTempDirectory();
        expect(options?.dir).toBeUndefined();
        expect(options?.prefix).toBe('coderail_');
        expect((await Deno.stat(directory.path)).isDirectory).toBe(true);
        expect(tempContext.registeredResourcePaths).toContain(directory.path);
        await cleanupTempResources();
        await expect(Deno.stat(directory.path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        Deno.makeTempDir = original;
        tempContext.registeredResourcePaths.length = 0;
    }
});

Deno.test('Fs::makeTempDirectory fails when project temp storage is blocked', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, '.coderail'));
        const parent = join(root, '.coderail', '.tmp');
        await Deno.writeTextFile(parent, 'blocked');
        await expect(makeTempDirectory(root)).rejects.toBeInstanceOf(Deno.errors.AlreadyExists);
        expect(await Deno.readTextFile(parent)).toBe('blocked');
        expect(tempContext.registeredResourcePaths).toEqual([]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
