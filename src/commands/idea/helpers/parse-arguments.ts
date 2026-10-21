import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';

export type IdeaSubcommandArguments = {
    help: boolean;
    parent?: string;
    json?: boolean;
};

/** Parse supported options and collect positional arguments. */
export function parseArguments(
    originalArgs: readonly string[],
    command: Command,
    options: readonly ('parent' | 'json')[] = [],
): ParsedArguments<IdeaSubcommandArguments> {
    const args: IdeaSubcommandArguments = { help: false };
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
        if (arg.startsWith('--help=')) {
            Cli.raiseUsageError('Option "--help" does not take a value.', command);
        }
        if (arg === '--') {
            rest.push(...originalArgs.slice(i + 1));
            break;
        }
        if (options.includes('json') && (arg === '--json' || arg.startsWith('--json='))) {
            if (arg !== '--json') {
                Cli.raiseUsageError('Option "--json" does not take a value.', command);
            }
            args.json = true;
            continue;
        }
        if (
            options.includes('parent') &&
            (arg === '-p' || arg === '--parent' || arg.startsWith('--parent='))
        ) {
            const value = arg.startsWith('--parent=')
                ? arg.slice('--parent='.length)
                : originalArgs[++i];
            if (!value || value.startsWith('-')) {
                Cli.raiseUsageError('Option "--parent" requires a value.', command);
            }
            args.parent = value;
            continue;
        }
        if (arg.startsWith('-')) {
            Cli.raiseUsageError(`Unknown option "${arg}".`, command);
        }
        rest.push(arg);
    }
    return { args, rest };
}

/** Check positional argument counts after options and help have been parsed. */
export function validateArguments(
    parsed: ParsedArguments<IdeaSubcommandArguments>,
    command: Command,
    minimum: number,
    maximum: number,
): void {
    if (parsed.args.help) {
        return;
    }
    if (parsed.rest.length < minimum) {
        Cli.raiseUsageError('Missing required arguments.', command);
    }
    if (parsed.rest.length > maximum) {
        Cli.raiseUsageError('Too many arguments.', command);
    }
}
