import { join } from '@std/path';
import { Path } from '@path';

export type IdeaFrontmatter = {
    title: string;
    status: IdeaStatus;
};

export type IdeaStatus = 'forging' | 'ready' | 'split';

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
    const ideaDirectory = join(cwd, Path.CODERAIL_DIR, Path.PLANS_DIR);
    const dirEntries = Deno.readDir(ideaDirectory);
    const promises: Promise<IdeaTreeItem>[] = [];
    for await (const dirEntry of dirEntries) {
        if (!dirEntry.isDirectory) {
            continue;
        }

        const promisedIdeaTreeItem = getIdeaTreeItem(ideaDirectory, '.', dirEntry.name);
        promises.push(promisedIdeaTreeItem);
    }
    return Promise.all(promises);
}

async function getIdeaTreeItem(
    ideaDirectory: string,
    parentIdea: string,
    currentIdea: string,
): Promise<IdeaTreeItem> {
    const fullPath = join(ideaDirectory, parentIdea, currentIdea);
    const ideaPath = join(parentIdea, currentIdea);
    const title = currentIdea;
    // TODO: Read frontmatter from IDEA.md if it exists.
    const frontmatter: IdeaFrontmatter = {
        status: 'forging',
        title,
    };
    const files: string[] = [];
    const promisedChildren: Promise<IdeaTreeItem>[] = [];

    const dirEntries = Deno.readDir(fullPath);
    for await (const dirEntry of dirEntries) {
        if (dirEntry.isFile) {
            files.push(dirEntry.name);
            continue;
        }

        if (dirEntry.isDirectory) {
            const promisedChild = getIdeaTreeItem(ideaDirectory, ideaPath, dirEntry.name);
            promisedChildren.push(promisedChild);
        }
    }

    const children = await Promise.all(promisedChildren);

    return {
        fullPath,
        ideaPath,
        title,
        frontmatter,
        files,
        children,
    };
}
