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
    const itemPromises: Promise<IdeaTreeItem | undefined>[] = [];
    for await (const dirEntry of dirEntries) {
        if (!dirEntry.isDirectory) {
            continue;
        }

        const itemPromise = getIdeaTreeItem(ideaDirectory, '.', dirEntry.name);
        itemPromises.push(itemPromise);
    }
    const items = await Promise.all(itemPromises);
    return items
        .filter((item) => item !== undefined)
        .sort((a, b) => a.id.localeCompare(b.id));
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
    const childrenPromises: Promise<IdeaTreeItem | undefined>[] = [];
    for (const directory of directories.sort()) {
        const childPromise = getIdeaTreeItem(ideaDirectory, id, directory);
        childrenPromises.push(childPromise);
    }
    const children = (await Promise.all(childrenPromises))
        .filter((item) => item !== undefined)
        .sort((a, b) => a.id.localeCompare(b.id));
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
