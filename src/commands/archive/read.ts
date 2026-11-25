import type { Command, ParsedArguments, RunContext } from '@commands';

import { readArchivedFile } from '../../archive/history.ts';
import { writeSync } from '../../log/helpers/write-sync.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class Read implements Command<ArchiveOptions> {
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
            '  cr archive read [--help] [--json] <batch-id>/<path-to-file>',
            '',
            '  Write the archived file bytes to standard output.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Accepted for compatibility. Output remains raw file bytes.',
            '',
            'Arguments:',
            '  <batch-id>/<path-to-file>  File path shown by an archive listing, including its batch ID.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<ArchiveOptions>): Promise<void> {
        const [path] = parsedArguments.rest as [string];
        writeSync(
            Deno.stdout,
            await readArchivedFile(context.currentWorkingDirectory, path, signal),
        );
    }
}
