import { expect } from '@std/expect';
import { join } from '@std/path';
import { getIdeaTree } from '../../../../src/commands/idea/utils/get-idea-tree.ts';

async function withPlans(run: (plans: string) => Promise<void>): Promise<void> {
    const plans = await Deno.makeTempDir();
    try {
        await run(plans);
    } finally {
        await Deno.remove(plans, { recursive: true });
    }
}

async function writeIdea(plans: string, path: string, metadata: string): Promise<void> {
    const directory = join(plans, path);
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(join(directory, 'IDEA.md'), `---\n${metadata}\n---\n# Body`);
}

Deno.test('getIdeaTree reads nested ideas, metadata, direct files, and sorted siblings', async () => {
    await withPlans(async (plans) => {
        await writeIdea(plans, 'z-root', 'title: Last\nstatus: ready');
        await writeIdea(plans, 'a-root', 'title: "Parent: idea"\nstatus: split');
        await writeIdea(plans, 'a-root/z-child', 'title: Last child\nstatus: forging');
        await writeIdea(plans, 'a-root/a-child', 'title: >-\n  First\n  child\nstatus: ready');
        await writeIdea(plans, 'a-root/a-child/leaf', 'title: Leaf\nstatus: forging');
        await Deno.writeTextFile(join(plans, 'a-root', 'SPEC.md'), 'Specification');
        await Deno.writeTextFile(join(plans, 'a-root', 'A.txt'), 'Attachment');
        await Deno.writeTextFile(join(plans, 'README.md'), 'Not an idea');
        await writeIdea(plans, 'not-an-idea/hidden', 'title: Hidden\nstatus: ready');
        await Deno.symlink(join(plans, 'a-root'), join(plans, 'linked-root'));
        await Deno.symlink(join(plans, 'a-root'), join(plans, 'a-root', 'cycle'));
        await Deno.symlink(join(plans, 'a-root', 'SPEC.md'), join(plans, 'a-root', 'link.md'));
        await Deno.mkdir(join(plans, 'linked-metadata'));
        await Deno.symlink(
            join(plans, 'a-root', 'IDEA.md'),
            join(plans, 'linked-metadata', 'IDEA.md'),
        );

        const leaf = {
            fullPath: join(plans, 'a-root', 'a-child', 'leaf'),
            ideaPath: 'a-root/a-child/leaf',
            title: 'Leaf',
            status: 'forging',
            files: ['IDEA.md'],
            children: [],
        };
        expect(await getIdeaTree(plans)).toEqual([
            {
                fullPath: join(plans, 'a-root'),
                ideaPath: 'a-root',
                title: 'Parent: idea',
                status: 'split',
                files: ['A.txt', 'IDEA.md', 'SPEC.md'],
                children: [
                    {
                        fullPath: join(plans, 'a-root', 'a-child'),
                        ideaPath: 'a-root/a-child',
                        title: 'First child',
                        status: 'ready',
                        files: ['IDEA.md'],
                        children: [leaf],
                    },
                    {
                        fullPath: join(plans, 'a-root', 'z-child'),
                        ideaPath: 'a-root/z-child',
                        title: 'Last child',
                        status: 'forging',
                        files: ['IDEA.md'],
                        children: [],
                    },
                ],
            },
            {
                fullPath: join(plans, 'z-root'),
                ideaPath: 'z-root',
                title: 'Last',
                status: 'ready',
                files: ['IDEA.md'],
                children: [],
            },
        ]);
    });
});

Deno.test('getIdeaTree returns an empty tree for an empty plans directory', async () => {
    await withPlans(async (plans) => {
        expect(await getIdeaTree(plans)).toEqual([]);
    });
});

Deno.test('getIdeaTree rejects relative paths and propagates filesystem errors', async () => {
    await expect(getIdeaTree('relative/plans')).rejects.toThrow('absolute path');
    await withPlans(async (plans) => {
        await expect(getIdeaTree(join(plans, 'missing'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
        const file = join(plans, 'file');
        await Deno.writeTextFile(file, '');
        await expect(getIdeaTree(file)).rejects.toBeInstanceOf(Deno.errors.NotADirectory);
    });
});

Deno.test('getIdeaTree rejects missing or invalid title and status with the idea filename', async () => {
    await withPlans(async (plans) => {
        for (
            const metadata of [
                '',
                'null',
                '42',
                'status: ready',
                'title: 42\nstatus: ready',
                'title: "  "\nstatus: ready',
                'title: Valid',
                'title: Valid\nstatus: unknown',
                'title: Valid\nstatus: null',
            ]
        ) {
            await writeIdea(plans, 'invalid', metadata);
            await expect(getIdeaTree(plans)).rejects.toThrow(
                `Invalid idea title or status: ${join(plans, 'invalid', 'IDEA.md')}`,
            );
        }
        await Deno.writeTextFile(join(plans, 'invalid', 'IDEA.md'), '# No front matter');
        await expect(getIdeaTree(plans)).rejects.toThrow(join(plans, 'invalid', 'IDEA.md'));
    });
});

Deno.test('getIdeaTree reports malformed YAML with its filename and original cause', async () => {
    await withPlans(async (plans) => {
        await writeIdea(plans, 'invalid', 'title: [broken\nstatus: ready');
        try {
            await getIdeaTree(plans);
            throw new Error('Expected invalid YAML to reject');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const failure = error as Error;
            expect(failure.message).toBe(
                `Invalid idea front matter: ${join(plans, 'invalid', 'IDEA.md')}`,
            );
            expect(failure.cause).toBeInstanceOf(Error);
        }
    });
});
