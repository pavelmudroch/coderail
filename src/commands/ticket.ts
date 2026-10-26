import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Cli } from '@cli';
import { Log } from '@log';
import { Next } from './ticket/next.ts';
import { Create } from './ticket/create.ts';
import { Close } from './ticket/close.ts';
import { Activate } from './ticket/activate.ts';
import { Reopen } from './ticket/reopen.ts';

type TicketArguments = {
    help: boolean;
    json: boolean;
    command?: string;
};

export class Ticket implements Command<TicketArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<TicketArguments> {
        const args: TicketArguments = { help: false, json: false };
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

    shouldHandleHelp(parsedArguments: ParsedArguments<TicketArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket [--help] [--json] <command>',
            '',
            '  Management of tickets.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '',
            'Commands:',
            '  next                 Show filtered list of the next tickets.',
            '  create               Create a new ticket.',
            '  close                Close an existing ticket.',
            '  activate             Activate an existing ticket.',
            '  reopen               Reopen a closed ticket.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(parsedArguments: ParsedArguments<TicketArguments>): Command | undefined {
        switch (parsedArguments.args.command) {
            case 'next':
                return new Next();
            case 'create':
                return new Create();
            case 'close':
                return new Close();
            case 'activate':
                return new Activate();
            case 'reopen':
                return new Reopen();
            case undefined:
                return undefined;
            default:
                Cli.raiseUsageError(
                    `Unknown ticket subcommand "${parsedArguments.args.command}".`,
                    this,
                );
        }
    }

    run(context: RunContext<TicketArguments>): Promise<void> {
        Log.trace('Unreachable code', context);
        Cli.raiseUsageError('Ticket command requires a subcommand.', this);
    }
}
