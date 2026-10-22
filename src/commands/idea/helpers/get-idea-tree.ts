import { isAbsolute, join } from '@std/path';
import { Path } from '@path';
import type { IdeaFrontmatter } from './idea-frontmatter.ts';
import { getIdeaFrontmatter } from './get-idea-frontmatter.ts';

export interface IdeaTreeItem {
    path: string;
    id: string;
    slug: string;
    frontmatter: IdeaFrontmatter;
    /**
     * Files directly in this idea directory, relative to full path.
     * Includes IDEA.md and any other artifacts, such as SPEC.md.
     */
    files: string[];
    children: IdeaTree;
}

export type IdeaTree = IdeaTreeItem[];

export async function getIdeaTree(cwd: string): Promise<IdeaTree> {
    if (!isAbsolute(cwd)) {
        throw new Error('Expected an absolute path');
    }
    const ideaDirectory = join(cwd, Path.CODERAIL_DIR, Path.PLANS_DIR);
    const dirEntries = Deno.readDir(ideaDirectory);
    const items: IdeaTreeItem[] = [];
    for await (const dirEntry of dirEntries) {
        if (!dirEntry.isDirectory) {
            continue;
        }

        const item = await getIdeaTreeItem(ideaDirectory, '.', dirEntry.name);
        if (item !== undefined) items.push(item);
    }
    return items.sort((a, b) => a.id.localeCompare(b.id));
}

async function getIdeaTreeItem(
    ideaDirectory: string,
    parentIdea: string,
    currentIdea: string,
): Promise<IdeaTreeItem | undefined> {
    const path = join(ideaDirectory, parentIdea, currentIdea);
    const id = join(parentIdea, currentIdea);
    const files: string[] = [];
    const directories: string[] = [];

    const dirEntries = Deno.readDir(path);
    for await (const dirEntry of dirEntries) {
        if (dirEntry.isFile) {
            files.push(dirEntry.name);
            continue;
        }

        if (dirEntry.isDirectory) {
            directories.push(dirEntry.name);
        }
    }

    if (!files.includes('IDEA.md')) return undefined;
    const frontmatter = await getIdeaFrontmatter(join(path, 'IDEA.md'));
    const children: IdeaTree = [];
    for (const directory of directories.sort()) {
        const child = await getIdeaTreeItem(ideaDirectory, id, directory);
        if (child !== undefined) children.push(child);
    }
    files.sort();

    return {
        path,
        id,
        slug: currentIdea,
        frontmatter,
        files,
        children,
    };
}
