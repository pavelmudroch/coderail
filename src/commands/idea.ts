import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Cli } from '@cli';
import { Create } from './idea/create.ts';
import { Split } from './idea/split.ts';
import { Ready } from './idea/ready.ts';
import { Reforge } from './idea/reforge.ts';
import { ensurePlansDir } from './idea/helpers/ensure-plans-dir.ts';
import { getIdeaTree } from './idea/helpers/get-idea-tree.ts';
import { Log } from '@log';
import { formatJson, formatText } from './idea/helpers/format.ts';

type IdeaArguments = {
    help: boolean;
    json: boolean;
    command?: string;
};

export class Idea implements Command<IdeaArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<IdeaArguments> {
        const args: IdeaArguments = { help: false, json: false };
        const rest: string[] = [];
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest };
            }
            if (arg === '--json') {
                args.json = true;
                rest.push(arg);
                continue;
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg.startsWith('--json=')) {
                Cli.raiseUsageError('Option "--json" does not take a value.', this);
            }
            if (arg === '--') {
                args.command = originalArgs[i + 1];
                rest.push(...originalArgs.slice(i + 2));
                return { args, rest };
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.command = arg;
            rest.push(...originalArgs.slice(i + 1));
            return { args, rest };
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<IdeaArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr idea [--help] [--json] [<command>]',
            '',
            '  Display structured idea tree. Also provides subcommands for idea management.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '',
            'Commands:',
            '  create               Create a new idea.',
            '  split                Split an existing idea into multiple child sub ideas.',
            '  ready                Mark an idea as ready for further processing.',
            '  reforge              Reforge an existing idea into a new form. Not applicable',
            '                       for splitted idea.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(parsedArguments: ParsedArguments<IdeaArguments>): Command | undefined {
        switch (parsedArguments.args.command) {
            case 'create':
                return new Create();
            case 'split':
                return new Split();
            case 'ready':
                return new Ready();
            case 'reforge':
                return new Reforge();
            case undefined:
                return undefined;
            default:
                Cli.raiseUsageError(
                    `Unknown idea subcommand "${parsedArguments.args.command}".`,
                    this,
                );
        }
    }

    async run(context: RunContext<IdeaArguments>): Promise<void> {
        try {
            await ensurePlansDir(context.context.currentWorkingDirectory);
            const ideaTree = await getIdeaTree(context.context.currentWorkingDirectory);

            if (context.parsedArguments.args.json) {
                Log.output(formatJson(ideaTree));
                return;
            }

            Log.output(formatText(ideaTree));
        } catch (error) {
            throw new Error('Cannot build idea tree', { cause: error });
        }
    }
}
