import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';

import { Apply } from './archive/apply.ts';
import { List } from './archive/list.ts';
import { Plans } from './archive/plans.ts';
import { Preview } from './archive/preview.ts';
import { Read } from './archive/read.ts';
import { Tickets } from './archive/tickets.ts';

type ArchiveArguments = {
    help: boolean;
    command?: string;
};

export class Archive implements Command<ArchiveArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveArguments> {
        const args: ArchiveArguments = { help: false };
        const rest: string[] = [];
        for (const [index, arg] of originalArgs.entries()) {
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                break;
            }
            if (arg === '--json') {
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
                args.command = originalArgs[index + 1];
                rest.push(...originalArgs.slice(index + 2));
                break;
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.command = arg;
            rest.push(...originalArgs.slice(index + 1));
            break;
        }
        return { args, rest };
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive [--help] [--json] <command>',
            '',
            '  Manage archive batches and archived files within the history branch.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format where supported.',
            '',
            'Commands:',
            '  preview              Show which tickets and plans can be archived.',
            '  apply                Record and remove eligible files.',
            '  list                 List retained archive batches.',
            '  plans                List archived plans and their artifacts.',
            '  tickets              List archived tickets.',
            '  read                 Read an archived file by its batch-relative listing path.',
        ].join('\n');
    }

    getSubcommand({ args }: ParsedArguments<ArchiveArguments>): Command {
        switch (args.command) {
            case 'preview':
                return new Preview();
            case 'apply':
                return new Apply();
            case 'list':
                return new List();
            case 'plans':
                return new Plans();
            case 'tickets':
                return new Tickets();
            case 'read':
                return new Read();
            case undefined:
                Cli.raiseUsageError('Required archive subcommand is missing.', this);
            default:
                Cli.raiseUsageError(`Unknown archive subcommand "${args.command}".`, this);
        }
    }

    run(): Promise<void> {
        return Promise.resolve();
    }
}
