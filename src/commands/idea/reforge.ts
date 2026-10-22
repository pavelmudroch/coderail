import type { Command, ParsedArguments, RunContext } from '@commands';
import { parseArguments, validateArguments } from './helpers/parse-arguments.ts';

type ReforgeArguments = {
    help: boolean;
    ideaReference?: string;
};

export class Reforge implements Command<ReforgeArguments> {
    readonly requiresInit = true;

    parseArguments(args: readonly string[]): ParsedArguments<ReforgeArguments> {
        const parsed = parseArguments(args, this, []);
        validateArguments(parsed, this, 1, 1);
        return { args: { help: parsed.args.help, ideaReference: parsed.rest[0] }, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<ReforgeArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea reforge [--help] <idea>',
            '',
            '  Reforge an existing idea. Not applicable to a split idea.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '',
            'Arguments:',
            '  <idea>               Path, slug, id or title of the idea to reforge.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    // Execution will be implemented separately from help and dispatch.
    run(_context: RunContext<ReforgeArguments>): Promise<void> {
        return Promise.resolve();
    }
}
