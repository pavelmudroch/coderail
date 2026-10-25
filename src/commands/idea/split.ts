import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { join } from '@std/path';
import { Text } from '@utils';
import { formatJson, formatText } from './helpers/format.ts';
import { IDEA_STATUS } from './helpers/idea-frontmatter.ts';
import { resolveIdea } from './helpers/resolve-idea.ts';

type SplitArguments = {
    help: boolean;
    ideaReference: string;
    childTitles: string[];
    json: boolean;
};

export class Split implements Command<SplitArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<SplitArguments> {
        const args: SplitArguments = {
            help: false,
            ideaReference: '',
            childTitles: [],
            json: false,
        };
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
                if (!args.ideaReference) {
                    args.ideaReference = positional.shift() ?? '';
                }
                args.childTitles.push(...positional);
                break;
            }
            if (arg === '--json') {
                args.json = true;
                continue;
            }
            if (arg.startsWith('--json=')) {
                Cli.raiseUsageError('Option "--json" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            if (!args.ideaReference) {
                args.ideaReference = arg;
                continue;
            }
            args.childTitles.push(arg);
        }
        if (!args.ideaReference.trim()) {
            Cli.raiseUsageError('Missing required idea reference.', this);
        }
        if (args.childTitles.length < 2) {
            Cli.raiseUsageError('At least two child titles must be specified.', this);
        }
        const slugs = new Set<string>();
        for (const title of args.childTitles) {
            const slug = Text.slugify(title);
            if (!slug || /[/\\]/.test(title)) {
                Cli.raiseUsageError(
                    'Idea title must produce a nonempty slug and must not contain path separators.',
                    this,
                );
            }
            if (slugs.has(slug)) {
                Cli.raiseUsageError(`Duplicate child idea slug "${slug}".`, this);
            }
            slugs.add(slug);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<SplitArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea split [--help] [--json] <idea> <child_title> <child_title>',
            '                [<child_title> ...]',
            '',
            '  Split an existing idea into multiple child ideas.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  --json               Output the idea and its children as JSON.',
            '',
            'Arguments:',
            '  <idea>               Path, slug, id or title of the idea to split.',
            '  <child_title>        Title of a child idea. At least two child titles must be',
            '                       specified.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<SplitArguments>): Promise<void> {
        const reference = context.parsedArguments.args.ideaReference;
        const titles = context.parsedArguments.args.childTitles;
        try {
            const idea = await resolveIdea(context.context.currentWorkingDirectory, reference);
            if (idea.frontmatter.status === IDEA_STATUS.SPLIT) {
                throw new Error(`Idea "${idea.id}" is already split.`);
            }
            for (const title of titles) {
                const directory = join(idea.path, Text.slugify(title));
                if (await Fs.exists(directory)) {
                    throw new Error(`Idea with "${directory}" already exists.`);
                }
            }
            const filePath = join(idea.path, 'IDEA.md');
            const markdown = await Md.parse(await Fs.read(filePath, { text: true }));
            for (const title of titles) {
                const slug = Text.slugify(title);
                const directory = join(idea.path, slug);
                const childMarkdown = Md.create('', { title, status: IDEA_STATUS.FORGING });
                const childDir = await Fs.makeTempDirectory();
                await childDir.addFile('IDEA.md', Md.toStream(childMarkdown));
                await Fs.replace(childDir.path, directory);
                idea.children.push({
                    path: directory,
                    id: join(idea.id, slug),
                    slug,
                    frontmatter: { title, status: IDEA_STATUS.FORGING },
                    files: ['IDEA.md'],
                    children: [],
                });
            }
            markdown.frontmatter.status = IDEA_STATUS.SPLIT;
            await Fs.write(filePath, Md.toStream(markdown));
            idea.frontmatter.status = IDEA_STATUS.SPLIT;
            idea.children.sort((a, b) => a.id.localeCompare(b.id));
            if (context.parsedArguments.args.json) {
                Log.output(formatJson([idea]));
                return;
            }
            Log.output(formatText([idea]));
        } catch (error) {
            throw new Error(`Cannot split idea "${reference}"`, { cause: error });
        }
    }
}
