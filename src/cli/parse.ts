import { UsageError } from './usage-error.ts';
import { getUsage } from './help.ts';

export type CommandName = string;

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

export type ParsedArguments = {
    global: GlobalArguments;
    rest: string[];
};

export function parseGlobalArguments(originalArgs: readonly string[]): ParsedArguments {
    const rest: string[] = [];
    const global: GlobalArguments = {
        command: undefined,
        cwd: undefined,
        help: false,
        version: false,
        nonInteractive: false,
        noColor: false,
        verbose: false,
        quiet: false,
    };

    const args = [...originalArgs];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === undefined) {
            continue;
        }

        switch (true) {
            case arg === '-h':
            case arg === '--help':
                if (global.command !== undefined) {
                    rest.push(arg);
                    break;
                }
                global.help = true;
                return { global, rest };
            case arg.startsWith('--help='):
                raiseUsageError('Option "--help" does not take a value.');
            case arg === '--version':
                global.version = true;
                break;
            case arg.startsWith('--version='):
                raiseUsageError('Option "--version" does not take a value.');
            case arg === '--non-interactive':
                global.nonInteractive = true;
                break;
            case arg.startsWith('--non-interactive='):
                raiseUsageError('Option "--non-interactive" does not take a value.');
            case arg === '--no-color':
                global.noColor = true;
                break;
            case arg.startsWith('--no-color='):
                raiseUsageError('Option "--no-color" does not take a value.');
            case arg === '-v':
            case arg === '--verbose':
                if (global.quiet) {
                    raiseUsageError('Cannot use "--verbose" when "--quiet" is enabled.');
                }
                global.verbose = true;
                break;
            case arg.startsWith('--verbose='):
                raiseUsageError('Option "--verbose" does not take a value.');
            case arg === '-q':
            case arg === '--quiet':
                if (global.verbose) {
                    raiseUsageError('Cannot use "--quiet" when "--verbose" is enabled.');
                }
                global.quiet = true;
                break;
            case arg.startsWith('--quiet='):
                raiseUsageError('Option "--quiet" does not take a value.');
            case arg === '--cwd':
                {
                    const nextArg = args[i + 1];
                    if (nextArg === undefined || nextArg.startsWith('-')) {
                        raiseUsageError('Option "--cwd" requires a value.');
                    }
                    global.cwd = nextArg;
                    i++; // Skip the next argument as it has been consumed
                }
                break;
            case arg.startsWith('--cwd='):
                global.cwd = arg.split('=', 2)[1] ?? './';
                break;
            case arg === '--':
                rest.push(...args.slice(i));
                return { global, rest };
            case arg.startsWith('--'):
                if (global.command === undefined) {
                    raiseUsageError(`Unknown option "${arg}".`);
                }
                rest.push(arg);
                break;
            case arg.startsWith('-'):
                if (arg.length > 2) {
                    args.splice(i, 1, ...arg.slice(1).split('').map((ch) => `-${ch}`));
                    i--; // Re-evaluate the current index with the newly spliced arguments
                    break;
                }
                if (global.command === undefined) {
                    raiseUsageError(`Unknown option "${arg}".`);
                }
                rest.push(arg);
                break;
            default:
                if (global.command === undefined) {
                    global.command = arg;
                    break;
                }
                rest.push(arg);
                break;
        }
    }

    return { global, rest };
}

function raiseUsageError(message: string): never {
    throw new UsageError(message, { usage: getUsage });
}
