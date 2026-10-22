import { dirname } from '@std/path/dirname';
import type { IdeaTree } from './get-idea-tree.ts';
import type { IdeaStatus } from './idea-frontmatter.ts';
import { Log } from '@log';

export type IdeaArtifact = {
    path: string;
    title: string;
    id: string;
    status: IdeaStatus;
    parent: string | null;
    files: string[];
};

export function formatJson(ideaTree: IdeaTree): string {
    const artifacts: IdeaArtifact[] = [];
    function populateIdeaTreeArtifacts(ideaTree: IdeaTree): void {
        for (const idea of ideaTree) {
            const parent = idea.id === idea.slug ? null : dirname(idea.id);
            artifacts.push({
                path: idea.path,
                id: idea.id,
                title: idea.frontmatter.title,
                status: idea.frontmatter.status,
                parent: parent,
                files: idea.files,
            });
            if (idea.children.length > 0) {
                populateIdeaTreeArtifacts(idea.children);
            }
        }
    }
    populateIdeaTreeArtifacts(ideaTree);
    return JSON.stringify(artifacts, null, 4);
}

export function formatText(ideaTree: IdeaTree): string {
    const formattedLines: string[] = [];
    function getFormattedStatus(status: IdeaStatus): string {
        switch (status) {
            case 'forging':
                return Log.color.yellow('◌ forging');
            case 'ready':
                return Log.color.green('● ready');
            case 'split':
                return Log.color.magenta('◉ split');
        }
    }

    function populateFormattedLines(ideaTree: IdeaTree, prefix: string): void {
        for (const [index, idea] of ideaTree.entries()) {
            const isLast = index === ideaTree.length - 1;
            const indent = prefix + (isLast ? '└──' : '├──');
            const status = getFormattedStatus(idea.frontmatter.status);
            const files = Log.color.gray('[' + idea.files.join(', ') + ']');
            const line = `${indent} ${Log.color.cyan(idea.frontmatter.title)} ${status} ${files}`;
            const pathIndent = prefix + (isLast ? '    ' : '│   ');
            const path = pathIndent + Log.color.gray(idea.path);
            formattedLines.push(line, path);
            if (idea.children.length > 0) {
                populateFormattedLines(idea.children, prefix + (isLast ? '    ' : '│   '));
            }
        }
    }

    populateFormattedLines(ideaTree, '');
    return formattedLines.join('\n');
}
