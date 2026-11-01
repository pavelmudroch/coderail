import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';

export class Upgrade implements Command {
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
            '  cr upgrade [--help]',
            '',
            '  ',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
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
