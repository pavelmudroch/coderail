import type { Command, ParsedArguments } from '@commands';

import type { RunContext } from './helpers/command.ts';

export class Loop implements Command {
    readonly requiresInit = false;

    parseArguments(_args: readonly string[]): ParsedArguments {
        return { args: {}, rest: [] };
    }

    shouldHandleHelp(_parsedArguments: ParsedArguments): boolean {
        return false;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr loop [--help] [--limit <n>] [--auto-commit] [--auto-review] [<harness>]',
            '',
            '  Run automated loop to implement opened tickets.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -l, --limit <n>      Limit the number of loop iterations.',
            '  -c, --auto-commit    Automatically commit changes after each loop iteration.',
            '  -r, --auto-review    Automatically review changes after each loop iteration.',
            '',
            'Arguments:',
            '  <harness>            The harness to use for the loop.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(_context: RunContext): Promise<void> {
        return Promise.resolve();
    }
}
