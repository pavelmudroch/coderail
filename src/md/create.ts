import type { Frontmatter } from './helpers/frontmatter.ts';
import type { Markdown } from './parse.ts';

export function create(content: string, frontmatter: Frontmatter): Markdown {
    return {
        frontmatter,
        content: new ReadableStream<string>({
            start(controller): void {
                controller.enqueue(content);
                controller.close();
            },
        }),
    };
}
