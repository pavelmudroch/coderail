import type { Command, ParsedArguments } from '@commands';

import { Templates } from '../templates.ts';
import type { RunContext } from './helpers/command.ts';
import {
    Create,
    outputTemplates,
    parseTemplateArguments,
    type TemplateArguments,
} from './template/create.ts';
import { Delete } from './template/delete.ts';

export class Template implements Command<TemplateArguments> {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments<TemplateArguments> {
        return parseTemplateArguments(this, args, 'list');
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<TemplateArguments>): boolean {
        return parsedArguments.args.help;
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

    getSubcommand(parsedArguments: ParsedArguments<TemplateArguments>): Command | undefined {
        if (parsedArguments.args.command === 'create') {
            return new Create();
        }
        if (parsedArguments.args.command === 'delete') {
            return new Delete();
        }
        return undefined;
    }

    async run(context: RunContext<TemplateArguments>): Promise<void> {
        const args = context.parsedArguments.args;
        const root = context.context.installRoot;
        outputTemplates(
            args.name === undefined
                ? await Templates.list(root, context.signal)
                : [await Templates.get(root, args.name, context.signal)],
            args,
        );
    }
}
