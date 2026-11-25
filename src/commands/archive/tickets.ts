import type { Command, ParsedArguments, RunContext } from '@commands';

import { listArchivedTickets } from '../../archive/history.ts';
import { printArchiveListing } from './helpers/output.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class Tickets implements Command<ArchiveOptions> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveOptions> {
        return parseArchiveArguments(originalArgs, this, 1);
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveOptions>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive tickets [--help] [--json] <batch-id>',
            '',
            '  List archived tickets.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the archived tickets in JSON format.',
            '',
            'Arguments:',
            '  <batch-id>           Batch ID shown by cr archive list.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<ArchiveOptions>): Promise<void> {
        const [batchId] = parsedArguments.rest as [string];
        const tickets = await listArchivedTickets(context.currentWorkingDirectory, batchId, signal);
        printArchiveListing(
            tickets,
            parsedArguments.args.json,
            () => tickets.map(({ id, title, path }) => `${id}  ${title}  ${path}`),
            `No archived tickets in "${batchId}".`,
        );
    }
}
