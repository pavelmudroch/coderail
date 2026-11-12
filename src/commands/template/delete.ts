import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';
import { Templates } from '@templates';

import { outputTemplates, parseTemplateArguments, type TemplateArguments } from './create.ts';

export class Delete implements Command<TemplateArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<TemplateArguments> {
        return parseTemplateArguments(this, args, 'delete');
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<TemplateArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr template delete [--help] [--json | --path] [--yes] <name>',
            '',
            '  Delete the template directory with the specified name.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output in JSON format.',
            '      --path           Show only the path to the template.',
            '      --yes            Confirm deletion without prompting.',
            '',
            'Arguments:',
            '  <name>               Name of the template to delete.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<TemplateArguments>): Promise<void> {
        const args = context.parsedArguments.args;
        const info = await Templates.get(
            context.context.installRoot,
            args.name as string,
            context.signal,
        );
        if (!args.yes) {
            if (context.configuration.nonInteractive || !Deno.stdin.isTerminal()) {
                throw new Error(
                    'Template deletion requires confirmation. Use --yes in noninteractive mode.',
                );
            }
            if (!Log.confirm(`Delete template "${info.name}" at "${info.path}"?`)) {
                return;
            }
        }
        outputTemplates(
            [await Templates.delete(context.context.installRoot, info.name, context.signal)],
            args,
        );
    }
}
