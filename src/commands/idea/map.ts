import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from '../helpers/command.ts';
import { parseArguments, validateArguments } from './utils/parse-arguments.ts';

type MapArguments = {
    help: boolean;
    json: boolean;
};

export class Map implements Command<MapArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<MapArguments> {
        const parsed = parseArguments(args, this, ['json']);
        validateArguments(parsed, this, 0, 0);
        return { args: { help: parsed.args.help, json: parsed.args.json ?? false }, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<MapArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea map [options]',
            '',
            '  Map an idea to a specific context or agent.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    // Execution will be implemented separately from help and dispatch.
    run(_context: RunContext<MapArguments>): Promise<void> {
        return Promise.resolve();
    }
}
