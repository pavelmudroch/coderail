import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';

export type ArchiveOptions = {
    help: boolean;
    json: boolean;
    yes: boolean;
};

export function parseArchiveArguments(
    originalArgs: readonly string[],
    command: Command,
    positionalCount: number,
    allowYes = false,
): ParsedArguments<ArchiveOptions> {
    const args = { help: false, json: false, yes: false };
    const rest: string[] = [];
    for (const [index, arg] of originalArgs.entries()) {
        if (arg === '-h' || arg === '--help') {
            args.help = true;
            return { args, rest };
        }
        if (arg === '--') {
            rest.push(...originalArgs.slice(index + 1));
            break;
        }
        if (arg === '--json') {
            args.json = true;
            continue;
        }
        if (allowYes && arg === '--yes') {
            args.yes = true;
            continue;
        }
        const [option, value] = arg.split('=', 2);
        if (
            value !== undefined &&
            (option === '--help' || option === '--json' || (allowYes && option === '--yes'))
        ) {
            Cli.raiseUsageError(`Option "${option}" does not take a value.`, command);
        }
        if (arg.startsWith('-')) {
            Cli.raiseUsageError(`Unknown option "${arg}".`, command);
        }
        rest.push(arg);
    }
    if (rest.length < positionalCount || rest.includes('')) {
        Cli.raiseUsageError('Missing required arguments.', command);
    }
    if (rest.length > positionalCount) {
        Cli.raiseUsageError('Too many arguments.', command);
    }
    return { args, rest };
}
