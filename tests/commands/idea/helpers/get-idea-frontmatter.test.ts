import { expect } from '@std/expect';
import { join } from '@std/path';
import { getIdeaFrontmatter } from '../../../../src/commands/idea/helpers/get-idea-frontmatter.ts';

async function withIdea(run: (filePath: string) => Promise<void>): Promise<void> {
    const directory = await Deno.makeTempDir();
    try {
        await run(join(directory, 'IDEA.md'));
    } finally {
        await Deno.remove(directory, { recursive: true });
    }
}

Deno.test('getIdeaFrontmatter reads title and each supported status', async () => {
    await withIdea(async (filePath) => {
        for (const status of ['forging', 'ready', 'split']) {
            await Deno.writeTextFile(
                filePath,
                `---\ntitle: "An idea: title"\nstatus: ${status}\nextra: true\n---\n# Body`,
            );
            expect(await getIdeaFrontmatter(filePath)).toEqual({ title: 'An idea: title', status });
        }
    });
});

Deno.test('getIdeaFrontmatter rejects missing or invalid metadata', async () => {
    await withIdea(async (filePath) => {
        for (
            const metadata of [
                '',
                'status: ready',
                'title: 42\nstatus: ready',
                'title: "  "\nstatus: ready',
                'title: [Idea]\nstatus: ready',
                'title: Idea',
                'title: Idea\nstatus: unknown',
                'title: Idea\nstatus: true',
                'title: Idea\nstatus: [ready]',
            ]
        ) {
            await Deno.writeTextFile(filePath, `---\n${metadata}\n---\n# Body`);
            await expect(getIdeaFrontmatter(filePath)).rejects.toThrow(
                `Invalid idea title or status: ${filePath}`,
            );
        }
        await Deno.writeTextFile(filePath, '# No front matter');
        await expect(getIdeaFrontmatter(filePath)).rejects.toThrow(
            `Invalid idea title or status: ${filePath}`,
        );
    });
});

Deno.test('getIdeaFrontmatter reports malformed front matter with its filename and cause', async () => {
    await withIdea(async (filePath) => {
        await Deno.writeTextFile(filePath, '---\ntitle: [broken\nstatus: ready\n---');
        try {
            await getIdeaFrontmatter(filePath);
            throw new Error('Expected malformed front matter to reject');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const failure = error as Error;
            expect(failure.message).toBe(`Invalid idea front matter: ${filePath}`);
            expect(failure.cause).toBeInstanceOf(SyntaxError);
        }
    });
});

Deno.test('getIdeaFrontmatter propagates filesystem errors', async () => {
    await withIdea(async (filePath) => {
        await expect(getIdeaFrontmatter(filePath)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    });
});
