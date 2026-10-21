import { isAbsolute, join } from '@std/path';
import { Path } from '@path';
import type { IdeaFrontmatter } from './idea-frontmatter.ts';
import { getIdeaFrontmatter } from './get-idea-frontmatter.ts';

export interface IdeaTreeItem {
    fullPath: string;
    ideaPath: string;
    title: string;
    frontmatter: IdeaFrontmatter;
    /**
     * Files directly in this idea directory, relative to fullPath.
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
    return items.sort((a, b) => a.ideaPath.localeCompare(b.ideaPath));
}

async function getIdeaTreeItem(
    ideaDirectory: string,
    parentIdea: string,
    currentIdea: string,
): Promise<IdeaTreeItem | undefined> {
    const fullPath = join(ideaDirectory, parentIdea, currentIdea);
    const ideaPath = join(parentIdea, currentIdea);
    const title = currentIdea;
    const files: string[] = [];
    const directories: string[] = [];

    const dirEntries = Deno.readDir(fullPath);
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
    const frontmatter = await getIdeaFrontmatter(join(fullPath, 'IDEA.md'));
    const children: IdeaTree = [];
    for (const directory of directories.sort()) {
        const child = await getIdeaTreeItem(ideaDirectory, ideaPath, directory);
        if (child !== undefined) children.push(child);
    }
    files.sort();

    return {
        fullPath,
        ideaPath,
        title,
        frontmatter,
        files,
        children,
    };
}
