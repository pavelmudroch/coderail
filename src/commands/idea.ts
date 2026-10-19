import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Cli } from '@cli';
import { Map } from './idea/map.ts';
import { Create } from './idea/create.ts';
import { Split } from './idea/split.ts';
import { Ready } from './idea/ready.ts';
import { Reforge } from './idea/reforge.ts';

type IdeaArguments = {
    help: boolean;
    command?: string;
};

export class Idea implements Command<IdeaArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<IdeaArguments> {
        const args: IdeaArguments = { help: false };
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg === '--') {
                args.command = originalArgs[i + 1];
                return { args, rest: originalArgs.slice(i + 2) };
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.command = arg;
            return { args, rest: originalArgs.slice(i + 1) };
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<IdeaArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr idea [options] <command>',
            '',
            '  The idea command provides management for building ideas with agent.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '',
            'Commands:',
            '  map                  Map an idea to a specific context or agent.',
            '  create               Create a new idea.',
            '  split                Split an existing idea into multiple child sub ideas.',
            '  ready                Mark an idea as ready for further processing.',
            '  reforge              Reforge an existing idea into a new form. Not applicable',
            '                       for splitted idea.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(parsedArguments: ParsedArguments<IdeaArguments>): Command {
        switch (parsedArguments.args.command) {
            case 'map':
                return new Map();
            case 'create':
                return new Create();
            case 'split':
                return new Split();
            case 'ready':
                return new Ready();
            case 'reforge':
                return new Reforge();
            case undefined:
                Cli.raiseUsageError('An idea subcommand is required.', this);
            default:
                Cli.raiseUsageError(
                    `Unknown idea subcommand "${parsedArguments.args.command}".`,
                    this,
                );
        }
    }

    run(_context: RunContext<IdeaArguments>): Promise<void> {
        return Promise.resolve();
    }
}
