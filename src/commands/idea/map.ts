import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from '../helpers/command.ts';
import { parseArguments, validateArguments } from './utils/parse-arguments.ts';
import { ensurePlansDir } from './utils/ensure-plans-dir.ts';

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
            '  cr idea map [--help] [--json]',
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

    async run(_context: RunContext<MapArguments>): Promise<void> {
        await ensurePlansDir(_context.context.currentWorkingDirectory);
    }
}
