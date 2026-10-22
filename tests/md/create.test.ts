import { expect } from '@std/expect';
import { create } from '../../src/md/create.ts';
import { parse } from '../../src/md/parse.ts';
import { toStream } from '../../src/md/to-stream.ts';

Deno.test('Md::create preserves content and frontmatter through serialization', async () => {
    const frontmatter = { title: 'Idea', tags: ['cli', 'parser'], ready: true, count: 2 };
    const content = '\r\n# Body 🌍\r\n---\r\ntitle: body\r\n---\r\n';
    const markdown = await parse(toStream(create(content, frontmatter)));

    expect(markdown.frontmatter).toEqual(frontmatter);
    let body = '';
    for await (const chunk of markdown.content) body += chunk;
    expect(body).toBe(content);
});

Deno.test('Md::create handles empty content and frontmatter', async () => {
    const markdown = create('', {});
    expect(markdown.frontmatter).toEqual({});
    let body = '';
    for await (const chunk of markdown.content) body += chunk;
    expect(body).toBe('');
});
