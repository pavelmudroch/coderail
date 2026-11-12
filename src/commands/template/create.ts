import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';
import { type TemplateInfo, Templates } from '@templates';

export type TemplateArguments = {
    help: boolean;
    json: boolean;
    path: boolean;
    name?: string;
    description: string;
    yes: boolean;
    command?: string;
};

export function parseTemplateArguments(
    command: Command,
    original: readonly string[],
    mode: 'list' | 'create' | 'delete',
): ParsedArguments<TemplateArguments> {
    const args: TemplateArguments = {
        help: false,
        json: false,
        path: false,
        description: '',
        yes: false,
    };
    let literal = false;
    for (let i = 0; i < original.length; i++) {
        const arg = original[i];
        if (arg === undefined) {
            continue;
        }
        if (!literal) {
            if (arg === '--') {
                literal = true;
                continue;
            }
            if (arg === '--help' || arg === '-h') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg === '--json') {
                args.json = true;
                continue;
            }
            if (arg === '--path') {
                args.path = true;
                continue;
            }
            if (mode === 'delete' && (arg === '--yes' || arg === '-y')) {
                args.yes = true;
                continue;
            }
            if (
                mode === 'create' &&
                (arg === '--description' || arg === '-d' || arg.startsWith('--description='))
            ) {
                const value = arg.startsWith('--description=') ? arg.slice(14) : original[++i];
                if (value === undefined) {
                    Cli.raiseUsageError('Option "--description" requires a value.', command);
                }
                args.description = value;
                continue;
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, command);
            }
            if (
                mode === 'list' &&
                (arg === 'create' || arg === 'delete') &&
                args.name === undefined
            ) {
                if (args.json || args.path) {
                    Cli.raiseUsageError('Put output options after the subcommand.', command);
                }
                args.command = arg;
                return { args, rest: original.slice(i + 1) };
            }
        }
        if (args.name !== undefined) {
            Cli.raiseUsageError(`Unexpected argument "${arg}".`, command);
        }
        args.name = arg;
    }
    if (args.json && args.path) {
        Cli.raiseUsageError('Options --json and --path are mutually exclusive.', command);
    }
    if (mode !== 'list' && !args.name?.trim()) {
        Cli.raiseUsageError('Missing required template name.', command);
    }
    return { args, rest: [] };
}

export function outputTemplates(entries: TemplateInfo[], args: TemplateArguments): void {
    if (args.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    for (const entry of entries) {
        if (args.path) {
            console.log(entry.path);
        } else {
            Log.output(`${entry.name}  ${entry.description}\n  ${entry.path}`);
        }
    }
}

export class Create implements Command<TemplateArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<TemplateArguments> {
        return parseTemplateArguments(this, args, 'create');
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<TemplateArguments>): boolean {
        return parsedArguments.args.help;
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
            '    ├── template       Config-format metadata: description = "text".',
            '    ├── config         Coderail configuration to be merged into project.',
            '    ├── startup.{sh|ps1|ts}',
            '    |                  Optional startup script (not generated). Precedence:',
            '    |                    1. platform specific script (sh, ps1).',
            '    |                    2. TypeScript script (ts).',
            '    └── assets/        Directory containing the structure of the template.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<TemplateArguments>): Promise<void> {
        const args = context.parsedArguments.args;
        const info = await Templates.create(
            context.context.installRoot,
            args.name as string,
            args.description,
            context.signal,
        );
        outputTemplates([info], args);
    }
}
