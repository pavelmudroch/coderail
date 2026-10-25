import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { join } from '@std/path';
import { formatJson, formatText } from './helpers/format.ts';
import { IDEA_STATUS } from './helpers/idea-frontmatter.ts';
import { resolveIdea } from './helpers/resolve-idea.ts';

type ReforgeArguments = {
    help: boolean;
    ideaReference: string;
    json: boolean;
};

export class Reforge implements Command<ReforgeArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ReforgeArguments> {
        const args: ReforgeArguments = {
            help: false,
            ideaReference: '',
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
                rest.push(...positional);
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
            rest.push(arg);
        }
        if (rest.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        if (!args.ideaReference.trim()) {
            Cli.raiseUsageError('Missing required idea reference.', this);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<ReforgeArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea reforge [--help] [--json] <idea>',
            '',
            '  Reforge an existing idea. Not applicable to a split idea.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  --json               Output the idea as JSON.',
            '',
            'Arguments:',
            '  <idea>               Path, slug, id or title of the idea to reforge.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<ReforgeArguments>): Promise<void> {
        const reference = context.parsedArguments.args.ideaReference;
        try {
            const idea = await resolveIdea(context.context.currentWorkingDirectory, reference);
            if (idea.frontmatter.status === IDEA_STATUS.SPLIT) {
                throw new Error(`Idea "${idea.id}" is split.`);
            }
            const filePath = join(idea.path, 'IDEA.md');
            const markdown = await Md.parse(await Fs.read(filePath, { text: true }));
            markdown.frontmatter.status = IDEA_STATUS.FORGING;
            await Fs.write(filePath, Md.toStream(markdown));
            idea.frontmatter.status = IDEA_STATUS.FORGING;
            if (context.parsedArguments.args.json) {
                Log.output(formatJson([idea]));
                return;
            }
            Log.output(formatText([idea]));
        } catch (error) {
            throw new Error(`Cannot reforge idea "${reference}"`, { cause: error });
        }
    }
}
