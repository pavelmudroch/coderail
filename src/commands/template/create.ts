import type { Command, ParsedArguments, RunContext } from '@commands';

export class Create implements Command {
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
            '  cr template create [--help] [--json | --path] [--description <text>] <name>',
            '',
            '  Create a new empty template directory with the specified name.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -d, --description <text>',
            '                       Description for the new template.',
            '      --json           Output in JSON format.',
            '      --path           Show only the path to the template.',
            '',
            'Arguments:',
            '  <name>               Name of the template to create.',
            '',
            'Template structure is as follows:',
            '  <template-name>/',
            '    ├── template.conf  Configuration describing the template.',
            '    ├── startup.{sh|ps1|bat|ts|conf}',
            '    |                  Startup script for the template. Run with precedence:',
            '    |                    1. platform specific script (sh, ps1, bat).',
            '    |                    2. TypeScript script (ts).',
            '    |                    3. Configuration file (conf).',
            '    └── structure/     Directory containing the structure of the template.',
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
