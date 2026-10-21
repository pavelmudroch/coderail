import { Fs } from '@fs';
import { Md } from '@md';
import { IdeaFrontmatter } from './idea-frontmatter.ts';

export async function getIdeaFrontmatter(filePath: string): Promise<IdeaFrontmatter> {
    const stream = await Fs.read(filePath, { text: true });
    let markdown;
    try {
        markdown = await Md.parse(stream);
    } catch (cause) {
        throw new Error(`Invalid idea front matter: ${filePath}`, { cause });
    }
    await markdown.content.cancel();

    if (!IdeaFrontmatter.isIdeaFrontmatter(markdown.frontmatter)) {
        throw new Error(`Invalid idea title or status: ${filePath}`);
    }
    const { title, status } = markdown.frontmatter;

    return { title, status };
}
