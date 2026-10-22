import { stringifyFrontmatter } from './helpers/frontmatter.ts';
import type { Markdown } from './parse.ts';

export function toStream(markdown: Markdown): ReadableStream<string> {
    const header = stringifyFrontmatter(markdown.frontmatter);
    const reader = markdown.content.getReader();
    let opening = true;
    return new ReadableStream<string>({
        async pull(controller): Promise<void> {
            if (opening) {
                opening = false;
                controller.enqueue(header === '' ? '---\n---\n' : `---\n${header}\n---\n`);
                return;
            }
            try {
                const chunk = await reader.read();
                if (chunk.done) {
                    controller.close();
                    reader.releaseLock();
                } else controller.enqueue(chunk.value);
            } catch (error) {
                controller.error(error);
                reader.releaseLock();
            }
        },
        async cancel(reason): Promise<void> {
            try {
                await reader.cancel(reason);
            } finally {
                reader.releaseLock();
            }
        },
    });
}
