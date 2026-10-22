import type { Command, ParsedArguments, RunContext } from '@commands';
import { ensurePlansDir } from './helpers/ensure-plans-dir.ts';
import { Text } from '@utils';
import { Cli } from '@cli';
import { resolveIdea } from './helpers/resolve-idea.ts';
import { join } from '@std/path';
import { Path } from '@path';
import { Fs } from '@fs';
import { Md } from '@md';
import { IDEA_STATUS } from './helpers/idea-frontmatter.ts';

type CreateArguments = {
    help: boolean;
    ideaTitle: string;
    parent?: string;
};

export class Create implements Command<CreateArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<CreateArguments> {
        const args: CreateArguments = { help: false, ideaTitle: '', parent: undefined };
        const rest: string[] = [];
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) continue;
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest };
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg === '--') {
                const positional = originalArgs.slice(i + 1);
                if (!args.ideaTitle) args.ideaTitle = positional.shift() ?? '';
                rest.push(...positional);
                break;
            }
            if (arg === '-p' || arg === '--parent' || arg.startsWith('--parent=')) {
                const value = arg.startsWith('--parent=')
                    ? arg.slice('--parent='.length)
                    : originalArgs[++i];
                if (!value || value.startsWith('-')) {
                    Cli.raiseUsageError('Option "--parent" requires a value.', this);
                }
                args.parent = value;
                continue;
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            if (!args.ideaTitle) {
                args.ideaTitle = arg;
                continue;
            }
            rest.push(arg);
        }
        if (rest.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        if (!args.ideaTitle.trim()) {
            Cli.raiseUsageError('Missing required idea title.', this);
        }
        const slug = Text.slugify(args.ideaTitle);
        if (!slug || /[/\\]/.test(args.ideaTitle)) {
            Cli.raiseUsageError(
                'Idea title must produce a nonempty slug and must not contain path separators.',
                this,
            );
        }

        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<CreateArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea create [--help] [--parent <parent_idea>] <idea_title>',
            '',
            '  Create a new idea.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -p, --parent <parent_idea>',
            '                       Path, slug, id or title to parent idea under which to',
            '                       create the new idea.',
            '',
            'Arguments:',
            '  <idea_title>         Title of the new idea.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<CreateArguments>): Promise<void> {
        const title = context.parsedArguments.args.ideaTitle;
        const slug = Text.slugify(title);
        const parent = context.parsedArguments.args.parent;
        let parentDirectory = join(
            context.context.currentWorkingDirectory,
            Path.CODERAIL_DIR,
            Path.PLANS_DIR,
        );

        try {
            await ensurePlansDir(context.context.currentWorkingDirectory);
            if (parent !== undefined) {
                const parentIdea = await resolveIdea(
                    context.context.currentWorkingDirectory,
                    parent,
                );
                if (parentIdea.frontmatter.status !== IDEA_STATUS.SPLIT) {
                    throw new Error(`Parent idea "${parentIdea.id}" is not split.`);
                }
                parentDirectory = join(parentDirectory, parentIdea.id);
            }
            const ideaDirectory = join(parentDirectory, slug);
            if (await Fs.exists(ideaDirectory)) {
                throw new Error(`Idea with "${ideaDirectory}" already exists.`);
            }

            const markdown = Md.create('', { title, status: IDEA_STATUS.FORGING });
            const ideaDir = await Fs.makeTempDirectory();
            await ideaDir.addFile('IDEA.md', Md.toStream(markdown));
            await Fs.replace(ideaDir.path, ideaDirectory);
        } catch (error) {
            throw new Error(`Cannot create idea "${title}"`, { cause: error });
        }
    }
}
