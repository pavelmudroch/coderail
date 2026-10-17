import type { Command, ParsedArguments, RunContext } from './helpers/command.ts';
import { Init } from './init.ts';
import { Install } from './install.ts';
import { Uninstall } from './uninstall.ts';
import { Upgrade } from './upgrade.ts';
import { Ticket } from './ticket.ts';
import { Idea } from './idea.ts';
import { Verify } from './verify.ts';
import { Doctor } from './doctor.ts';
import { Loop } from './loop.ts';
import { Cli } from '@cli';

type CommandName = string;

export type GlobalArguments = {
    command?: CommandName;
    cwd?: string;
    help: boolean;
    version: boolean;
    nonInteractive: boolean;
    noColor: boolean;
    verbose: boolean;
    quiet: boolean;
};

const COMMAND = {
    INIT: 'init',
    INSTALL: 'install',
    UNINSTALL: 'uninstall',
    UPGRADE: 'upgrade',
    TICKET: 'ticket',
    IDEA: 'idea',
    VERIFY: 'verify',
    DOCTOR: 'doctor',
    LOOP: 'loop',
};

export class Cr implements Command<GlobalArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<GlobalArguments> {
        return this.#parseGlobalArguments(args);
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<GlobalArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr [options] <command>',
            '',
            '  Coderail command-line interface for agent based development.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --version        Show the version information and exit.',
            '  -v, --verbose        Turn on verbose logging.',
            '  -q, --quiet          Turn off all logging except errors.',
            '      --cwd <path>     Set the current working directory.',
            '      --no-color       Disable colored output.',
            '      --non-interactive',
            '                       Run in non-interactive mode.',
            '',
            'Commands:',
            '  init                 Initialize the project.',
            '  install              Install instructions for given harness.',
            '  uninstall            Uninstall instructions for given harness.',
            '  upgrade              Upgrade coderail to different version.',
            '  ticket               Manage tickets related to the project.',
            '  idea                 Manage ideas related to the project.',
            '  verify               Verify files by project configuration.',
            '  doctor               Diagnose and fix issues in the project.',
            '  loop                 Run autonomous ticket implementation.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(parsedArguments: ParsedArguments<GlobalArguments>): Command | undefined {
        switch (parsedArguments.args.command) {
            case COMMAND.INIT:
                return new Init();
            case COMMAND.INSTALL:
                return new Install();
            case COMMAND.UNINSTALL:
                return new Uninstall();
            case COMMAND.UPGRADE:
                return new Upgrade();
            case COMMAND.TICKET:
                return new Ticket();
            case COMMAND.IDEA:
                return new Idea();
            case COMMAND.VERIFY:
                return new Verify();
            case COMMAND.DOCTOR:
                return new Doctor();
            case COMMAND.LOOP:
                return new Loop();
        }

        return undefined;
    }

    run(_context: RunContext<GlobalArguments>): Promise<void> {
        return Promise.resolve();
    }

    #parseGlobalArguments(
        originalArgs: readonly string[],
    ): ParsedArguments<GlobalArguments> {
        const rest: string[] = [];
        const args: GlobalArguments = {
            command: undefined,
            cwd: undefined,
            help: false,
            version: false,
            nonInteractive: false,
            noColor: false,
            verbose: false,
            quiet: false,
        };

        const argumentList = [...originalArgs];
        for (let i = 0; i < argumentList.length; i++) {
            const arg = argumentList[i];
            if (arg === undefined) {
                continue;
            }

            switch (true) {
                case arg === '-h':
                case arg === '--help':
                    if (args.command !== undefined) {
                        rest.push(arg);
                        break;
                    }
                    args.help = true;
                    return { args, rest };
                case arg.startsWith('--help='):
                    Cli.raiseUsageError('Option "--help" does not take a value.', this);
                case arg === '--version':
                    args.version = true;
                    break;
                case arg.startsWith('--version='):
                    Cli.raiseUsageError('Option "--version" does not take a value.', this);
                case arg === '--non-interactive':
                    args.nonInteractive = true;
                    break;
                case arg.startsWith('--non-interactive='):
                    Cli.raiseUsageError('Option "--non-interactive" does not take a value.', this);
                case arg === '--no-color':
                    args.noColor = true;
                    break;
                case arg.startsWith('--no-color='):
                    Cli.raiseUsageError('Option "--no-color" does not take a value.', this);
                case arg === '-v':
                case arg === '--verbose':
                    if (args.quiet) {
                        Cli.raiseUsageError(
                            'Cannot use "--verbose" when "--quiet" is enabled.',
                            this,
                        );
                    }
                    args.verbose = true;
                    break;
                case arg.startsWith('--verbose='):
                    Cli.raiseUsageError('Option "--verbose" does not take a value.', this);
                case arg === '-q':
                case arg === '--quiet':
                    if (args.verbose) {
                        Cli.raiseUsageError(
                            'Cannot use "--quiet" when "--verbose" is enabled.',
                            this,
                        );
                    }
                    args.quiet = true;
                    break;
                case arg.startsWith('--quiet='):
                    Cli.raiseUsageError('Option "--quiet" does not take a value.', this);
                case arg === '--cwd':
                    {
                        const nextArg = argumentList[i + 1];
                        if (nextArg === undefined || nextArg.startsWith('-')) {
                            Cli.raiseUsageError('Option "--cwd" requires a value.', this);
                        }
                        args.cwd = nextArg;
                        i++; // Skip the next argument as it has been consumed
                    }
                    break;
                case arg.startsWith('--cwd='):
                    args.cwd = arg.split('=', 2)[1] ?? './';
                    break;
                case arg === '--':
                    rest.push(...argumentList.slice(i));
                    return { args, rest };
                case arg.startsWith('--'):
                    if (args.command === undefined) {
                        Cli.raiseUsageError(`Unknown option "${arg}".`, this);
                    }
                    rest.push(arg);
                    break;
                case arg.startsWith('-'):
                    if (arg.length > 2) {
                        argumentList.splice(i, 1, ...arg.slice(1).split('').map((ch) => `-${ch}`));
                        i--; // Re-evaluate the current index with the newly spliced arguments
                        break;
                    }
                    if (args.command === undefined) {
                        Cli.raiseUsageError(`Unknown option "${arg}".`, this);
                    }
                    rest.push(arg);
                    break;
                default:
                    if (args.command === undefined) {
                        args.command = arg;
                        break;
                    }
                    rest.push(arg);
                    break;
            }
        }

        return { args, rest };
    }
}
