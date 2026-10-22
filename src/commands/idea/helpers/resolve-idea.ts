import { isAbsolute, join, resolve, SEPARATOR } from '@std/path';
import { Path } from '@path';
import { getIdeaTree, type IdeaTree, type IdeaTreeItem } from './get-idea-tree.ts';

/**
 * Resolve an explicit directory path, or an exact ID, slug, then title.
 * A trailing /IDEA.md is stripped before matching.
 * Explicit paths never fall back to other matches. Ambiguous matches require an ID.
 */
export async function resolveIdea(cwd: string, reference: string): Promise<IdeaTreeItem> {
    if (reference.endsWith('/IDEA.md')) {
        reference = reference.slice(0, -'/IDEA.md'.length);
    }
    const tree = await getIdeaTree(cwd);
    const ideas: IdeaTreeItem[] = [];
    function collect(items: IdeaTree): void {
        for (const item of items) {
            ideas.push(item);
            collect(item.children);
        }
    }
    collect(tree);

    const plansPrefix = join(Path.CODERAIL_DIR, Path.PLANS_DIR);
    const explicitPath = isAbsolute(reference) || reference === '.' || reference === '..' ||
        reference.startsWith(`.${SEPARATOR}`) || reference.startsWith(`..${SEPARATOR}`) ||
        reference === plansPrefix || reference.startsWith(`${plansPrefix}${SEPARATOR}`);
    const matchers: ((idea: IdeaTreeItem) => boolean)[] = explicitPath
        ? [(idea) => idea.path === resolve(cwd, reference)]
        : [
            (idea) => idea.id === reference,
            (idea) => idea.slug === reference,
            (idea) => idea.frontmatter.title === reference,
        ];

    for (const matchesReference of matchers) {
        const matches = ideas.filter(matchesReference);
        if (matches.length > 1) {
            throw new Error(
                `Ambiguous idea reference "${reference}". Use one of these IDs: ${
                    matches.map((idea) => idea.id).join(', ')
                }`,
            );
        }
        const match = matches[0];
        if (match !== undefined) return match;
    }
    throw new Error(`Idea not found: ${reference}`);
}
