import type { Command, ParsedArguments, RunContext } from '@commands';
import { parseArguments, validateArguments } from './helpers/parse-arguments.ts';

type SplitArguments = {
    help: boolean;
    ideaPath?: string;
    childTitles: string[];
};

export class Split implements Command<SplitArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<SplitArguments> {
        const parsed = parseArguments(args, this, []);
        validateArguments(parsed, this, 3, Number.POSITIVE_INFINITY);
        return {
            args: {
                help: parsed.args.help,
                ideaPath: parsed.rest[0],
                childTitles: parsed.rest.slice(1),
            },
            rest: [],
        };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<SplitArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr idea split [--help] <idea_path> <child_title> <child_title>',
            '                [<child_title> ...]',
            '',
            '  Split an existing idea into multiple child ideas.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '',
            'Arguments:',
            '  <idea_path>          Path to the idea to split.',
            '  <child_title>        Title of a child idea. At least two child titles must be',
            '                       specified.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    // Execution will be implemented separately from help and dispatch.
    run(_context: RunContext<SplitArguments>): Promise<void> {
        return Promise.resolve();
    }
}
