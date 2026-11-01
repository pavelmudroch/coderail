import type { Command, ParsedArguments, RunContext } from '@commands';

export class Delete implements Command {
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
            '  cr template delete [--help] [--json | --path] <name>',
            '',
            '  Delete the template directory with the specified name.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output in JSON format.',
            '      --path           Show only the path to the template.',
            '',
            'Arguments:',
            '  <name>               Name of the template to delete.',
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
