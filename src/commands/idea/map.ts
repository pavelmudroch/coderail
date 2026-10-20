import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from '../helpers/command.ts';
import { parseArguments, validateArguments } from './utils/parse-arguments.ts';
import { ensurePlansDir } from './utils/ensure-plans-dir.ts';
import { getIdeaTree, type IdeaStatus, type IdeaTree } from './utils/get-idea-tree.ts';
import { dirname } from '@std/path';
import { Log } from '@log';

type MapArguments = {
    help: boolean;
    json: boolean;
};

export class Map implements Command<MapArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<MapArguments> {
        const parsed = parseArguments(args, this, ['json']);
        validateArguments(parsed, this, 0, 0);
        return { args: { help: parsed.args.help, json: parsed.args.json ?? false }, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<MapArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea map [--help] [--json]',
            '',
            '  Map an idea to a specific context or agent.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<MapArguments>): Promise<void> {
        await ensurePlansDir(context.context.currentWorkingDirectory);
        const ideaTree = await getIdeaTree(context.context.currentWorkingDirectory);

        if (context.parsedArguments.args.json) {
            Log.output(formatJson(ideaTree));
            return;
        }

        Log.output(formatText(ideaTree));
    }
}

type IdeaArtifact = {
    path: string;
    dir: string;
    title: string;
    status: IdeaStatus;
    parent: string | null;
    files: string[];
};

function formatJson(ideaTree: IdeaTree): string {
    const artifacts: IdeaArtifact[] = [];
    function populateIdeaTreeArtifacts(ideaTree: IdeaTree): void {
        for (const idea of ideaTree) {
            const parent = idea.ideaPath === idea.title ? null : dirname(idea.ideaPath);
            artifacts.push({
                path: idea.ideaPath,
                dir: idea.fullPath,
                title: idea.title,
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

function formatText(ideaTree: IdeaTree): string {
    const formattedLines: string[] = [];
    function getFormattedStatus(status: IdeaStatus): string {
        switch (status) {
            case 'forging':
                return Log.color.yellow('forging');
            case 'ready':
                return Log.color.green('ready');
            case 'split':
                return Log.color.magenta('split');
        }
    }

    function populateFormattedLines(ideaTree: IdeaTree, prefix: string): void {
        for (const [index, idea] of ideaTree.entries()) {
            const isLast = index === ideaTree.length - 1;
            const indent = prefix + (isLast ? '└──' : '├──');
            const status = getFormattedStatus(idea.frontmatter.status);
            formattedLines.push(
                `${indent} ${Log.color.cyan(idea.title)} ${status} ${
                    Log.color.gray('[' + idea.files.join(', ') + ']')
                }`,
            );
            if (idea.children.length > 0) {
                populateFormattedLines(idea.children, prefix + (isLast ? '    ' : '│   '));
            }
        }
    }

    populateFormattedLines(ideaTree, '');
    return formattedLines.join('\n');
}
