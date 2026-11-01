import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';

export class Template implements Command {
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
            '  cr template [--help] [--json | --path] [<name> | <command>]',
            '',
            '  List, manage and interact with templates within the coderail system.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output in JSON format.',
            '      --path           Show only the path to the template.',
            '',
            'Arguments:',
            '  <name>               Name of the template to filter by. To list template with',
            '                       reserved name "create" or "delete", use "-- <name>".',
            '',
            'Commands:',
            '  create <name>        Create a new template with the specified name.',
            '  delete <name>        Delete the template with the specified name.',
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
