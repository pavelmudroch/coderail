import { type Frontmatter, parseFrontmatter } from './helpers/frontmatter.ts';

export type Markdown = {
    frontmatter: Frontmatter;
    content: ReadableStream<string>;
};

export async function parse(content: ReadableStream<string>): Promise<Markdown> {
    const reader = content.getReader();
    let pending = '';
    let done = false;

    async function readLine(): Promise<string | undefined> {
        for (;;) {
            const newline = pending.indexOf('\n');
            if (newline !== -1) {
                const line = pending.slice(0, newline + 1);
                pending = pending.slice(newline + 1);
                return line;
            }
            if (done) {
                if (pending === '') return undefined;
                const line = pending;
                pending = '';
                return line;
            }
            const chunk = await reader.read();
            done = chunk.done;
            if (!chunk.done) pending += chunk.value;
        }
    }

    function delimiter(line: string): boolean {
        return line.replace(/\r?\n$/, '') === '---';
    }

    let frontmatter: Frontmatter = {};
    try {
        const first = await readLine();
        if (first !== undefined && delimiter(first)) {
            let header = '';
            for (;;) {
                const line = await readLine();
                if (line === undefined) throw new SyntaxError('Unclosed frontmatter at line 1');
                if (delimiter(line)) break;
                header += line;
            }
            try {
                frontmatter = parseFrontmatter(header);
            } catch (error) {
                // parseFrontmatter reports syntax errors relative to the header text.
                throw new SyntaxError(
                    (error as SyntaxError).message.replace(
                        /line (\d+)$/,
                        (_, line: string) => `line ${Number(line) + 1}`,
                    ),
                );
            }
        } else {
            pending = (first ?? '') + pending;
        }
    } catch (error) {
        try {
            await reader.cancel(error);
        } catch {
            // Preserve the parse error if cancelling the source also fails.
        } finally {
            reader.releaseLock();
        }
        throw error;
    }

    return {
        frontmatter,
        content: new ReadableStream<string>({
            async pull(controller): Promise<void> {
                if (pending !== '') {
                    controller.enqueue(pending);
                    pending = '';
                    return;
                }
                try {
                    const chunk = done ? { done: true as const } : await reader.read();
                    if (chunk.done) {
                        controller.close();
                        reader.releaseLock();
                    } else {
                        controller.enqueue(chunk.value);
                    }
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
        }),
    };
}
