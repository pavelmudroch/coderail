import { type Markdown, parse } from './md/parse.ts';
import { toStream } from './md/to-stream.ts';

export type { Markdown };
export type { Frontmatter, Scalar } from './md/helpers/frontmatter.ts';

export interface Md {
    /**
     * Parses the markdown content from the provided readable stream.
     * @param content The readable stream containing the markdown content to parse.
     * @returns A promise that resolves to the parsed Markdown object.
     */
    parse(content: ReadableStream<string>): Promise<Markdown>;
    /**
     * Converts the provided Markdown object into a readable stream of markdown content.
     * @param markdown The Markdown object to convert.
     * @returns A readable stream containing the markdown content.
     */
    toStream(markdown: Markdown): ReadableStream<string>;
}

export const Md: Md = { parse, toStream };
