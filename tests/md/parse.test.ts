import { expect } from '@std/expect';
import { parse } from '../../src/md/parse.ts';
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

Deno.test('Md parses delimiters across chunks and preserves body bytes', async () => {
    const source = '---\r\ntitle: "Idea"\r\ntags:\r\n  - cli\r\n---\r\n\r\n# Body\r\n---\r\n';
    const markdown = await parse(stream(...source));
    expect(markdown.frontmatter).toEqual({ title: 'Idea', tags: ['cli'] });
    expect(await text(markdown.content)).toBe('\r\n# Body\r\n---\r\n');
});

Deno.test('Md preserves documents without opening frontmatter', async () => {
    for (const source of ['', '# Title\n---\n', '\n---\nvalue: 1\n---\n', '--- extra\n', 'plain']) {
        const markdown = await parse(stream(...source));
        expect(markdown.frontmatter).toEqual({});
        expect(await text(markdown.content)).toBe(source);
    }
});

Deno.test('Md handles empty frontmatter and closing delimiters at EOF', async () => {
    for (const source of ['---\n---', '---\n---\n', '---\r\n---\r\n']) {
        const markdown = await parse(stream(source));
        expect(markdown.frontmatter).toEqual({});
        expect(await text(markdown.content)).toBe('');
    }
});

Deno.test('Md reports malformed headers using document line numbers', async () => {
    await expect(parse(stream('---\na: true\na: false\n---\n'))).rejects.toThrow(
        /line 3/,
    );
    await expect(parse(stream('---\na: true\n'))).rejects.toThrow(
        /Unclosed frontmatter/,
    );
});

Deno.test('Md::parse preserves source failures and releases the reader', async () => {
    const failure = new Error('read failed');
    const source = new ReadableStream<string>({
        pull(controller): void {
            controller.error(failure);
        },
    });
    await expect(parse(source)).rejects.toBe(failure);
    expect(source.locked).toBe(false);

    let reads = 0;
    const body = new ReadableStream<string>({
        pull(controller): void {
            if (reads++ === 0) controller.enqueue('---\n---\n');
            else controller.error(failure);
        },
    });
    const markdown = await parse(body);
    await expect(text(markdown.content)).rejects.toBe(failure);
    expect(body.locked).toBe(false);
});

Deno.test('Md::parse cancels invalid input even when cancellation fails', async () => {
    let reason: unknown;
    const source = new ReadableStream<string>({
        start(controller): void {
            controller.enqueue('---\nbad\n---\n');
        },
        cancel(value): never {
            reason = value;
            throw new Error('cancel failed');
        },
    });
    await expect(parse(source)).rejects.toThrow('Expected a property at line 2');
    expect(reason).toBeInstanceOf(SyntaxError);
    expect(source.locked).toBe(false);
});

Deno.test('Md::parse forwards cancellation and releases the source lock', async () => {
    for (const fails of [true, false]) {
        let reason: unknown;
        const failure = new Error('cancel failed');
        const source = new ReadableStream<string>({
            start(controller): void {
                controller.enqueue('---\n---\nbody');
            },
            cancel(value): void {
                reason = value;
                if (fails) throw failure;
            },
        });
        const markdown = await parse(source);
        if (fails) await expect(markdown.content.cancel('stop')).rejects.toBe(failure);
        else await markdown.content.cancel('stop');
        expect(reason).toBe('stop');
        expect(source.locked).toBe(false);
    }
});

Deno.test('Md::parse preserves buffered body text when frontmatter is absent', async () => {
    const source = stream('# Title\nbody\n', 'more');
    const markdown = await parse(source);
    expect(markdown.frontmatter).toEqual({});
    expect(await text(markdown.content)).toBe('# Title\nbody\nmore');
    expect(source.locked).toBe(false);
});
