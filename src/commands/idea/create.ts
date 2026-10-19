import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from '../helpers/command.ts';
import { parseArguments, validateArguments } from './utils/parse-arguments.ts';

type CreateArguments = {
    help: boolean;
    ideaTitle?: string;
    parent?: string;
};

export class Create implements Command<CreateArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<CreateArguments> {
        const parsed = parseArguments(args, this, ['parent']);
        validateArguments(parsed, this, 1, 1);
        return { args: { ...parsed.args, ideaTitle: parsed.rest[0] }, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<CreateArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea create [options] <idea_title>',
            '',
            '  Create a new idea.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -p, --parent <parent_idea_path>',
            '                       Path to parent idea under which to create the new idea.',
            '',
            'Arguments:',
            '  <idea_title>         Title of the new idea.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    // Execution will be implemented separately from help and dispatch.
    run(_context: RunContext<CreateArguments>): Promise<void> {
        return Promise.resolve();
    }
}
