import type { Command, ParsedArguments, RunContext } from '@commands';
import { parseArguments, validateArguments } from './helpers/parse-arguments.ts';

type ReadyArguments = {
    help: boolean;
    ideaReference?: string;
};

export class Ready implements Command<ReadyArguments> {
    readonly requiresInit = true;

    parseArguments(args: readonly string[]): ParsedArguments<ReadyArguments> {
        const parsed = parseArguments(args, this, []);
        validateArguments(parsed, this, 1, 1);
        return { args: { help: parsed.args.help, ideaReference: parsed.rest[0] }, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<ReadyArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea ready [--help] <idea>',
            '',
            '  Mark an idea as ready for further processing.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '',
            'Arguments:',
            '  <idea>               Path, slug, id or title of the idea to mark as ready.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    // Execution will be implemented separately from help and dispatch.
    run(_context: RunContext<ReadyArguments>): Promise<void> {
        return Promise.resolve();
    }
}
