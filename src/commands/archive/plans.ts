import type { Command, ParsedArguments, RunContext } from '@commands';

import { listArchivedPlans } from '../../archive/history.ts';
import { printArchiveListing } from './helpers/output.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class Plans implements Command<ArchiveOptions> {
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
            '  cr archive plans [--help] [--json] <batch-id>',
            '',
            '  List archived plans and their artifacts.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the archived plans in JSON format.',
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
        const plans = await listArchivedPlans(context.currentWorkingDirectory, batchId, signal);
        printArchiveListing(
            plans,
            parsedArguments.args.json,
            () =>
                plans.flatMap(({ title, path, parent, artifacts }) => [
                    `${title}  ${path}`,
                    ...(parent === null ? [] : [`  Parent: ${parent}`]),
                    ...artifacts.map((artifact) => `  ${artifact}`),
                ]),
            `No archived plans in "${batchId}".`,
        );
    }
}
