import { expect } from '@std/expect';
import { toStream } from '../../src/md/to-stream.ts';
import type { Frontmatter } from '@md';
function stream(...chunks: string[]): ReadableStream<string> {
    return new ReadableStream({
        start(controller): void {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
}

async function text(content: ReadableStream<string>): Promise<string> {
    let result = '';
    for await (const chunk of content) result += chunk;
    return result;
}

Deno.test('Md::toStream serializes frontmatter and preserves the body', async () => {
    const frontmatter: Frontmatter = { title: 'Idea', tags: ['cli', 'parser'], ready: true };
    const serialized = await text(
        toStream({ frontmatter, content: stream('\n# Body\n', 'end') }),
    );
    expect(serialized).toBe(
        '---\ntitle: "Idea"\ntags:\n  - "cli"\n  - "parser"\nready: true\n---\n\n# Body\nend',
    );
    expect(await text(toStream({ frontmatter: {}, content: stream('body') }))).toBe(
        '---\n---\nbody',
    );
});

Deno.test('Md::toStream preserves read failures and releases the source lock', async () => {
    const failure = new Error('read failed');
    const source = new ReadableStream<string>({
        pull(controller): void {
            controller.error(failure);
        },
    });
    await expect(text(toStream({ frontmatter: {}, content: source }))).rejects.toBe(failure);
    expect(source.locked).toBe(false);
});

Deno.test('Md::toStream forwards cancellation and releases the source lock', async () => {
    for (const fails of [true, false]) {
        const failure = new Error('cancel failed');
        let reason: unknown;
        const source = new ReadableStream<string>({
            cancel(value): void {
                reason = value;
                if (fails) throw failure;
            },
        });
        const result = toStream({ frontmatter: {}, content: source });
        if (fails) await expect(result.cancel('stop')).rejects.toBe(failure);
        else await result.cancel('stop');
        expect(reason).toBe('stop');
        expect(source.locked).toBe(false);
    }
});
