import type { Command, ParsedArguments, RunContext } from '@commands';

import { listArchiveBatches } from '../../archive/history.ts';
import { printArchiveListing } from './helpers/output.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class List implements Command<ArchiveOptions> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveOptions> {
        return parseArchiveArguments(originalArgs, this, 0);
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveOptions>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive list [--help] [--json]',
            '',
            '  List retained archive batches.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the batch IDs in JSON format.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<ArchiveOptions>): Promise<void> {
        const batches = await listArchiveBatches(context.currentWorkingDirectory, signal);
        printArchiveListing(
            batches,
            parsedArguments.args.json,
            () => batches,
            'No archive batches.',
        );
    }
}
