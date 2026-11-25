import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';

import { applyArchive } from '../../archive/apply.ts';
import { writeSync } from '../../log/helpers/write-sync.ts';
import { writeArchiveJson } from './helpers/output.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class Apply implements Command<ArchiveOptions> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveOptions> {
        return parseArchiveArguments(originalArgs, this, 2, true);
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveOptions>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive apply [--help] [--json] [--yes] <batch-name> <description>',
            '',
            '  Record an archive batch and remove eligible files from the working tree.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '      --yes            Approve recording and removing eligible files without prompting.',
            '',
            'Arguments:',
            '  <batch-name>         Lowercase letters or digits separated by single hyphens.',
            '  <description>        Description to record in the archive batch.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({
        context,
        configuration,
        parsedArguments,
        signal,
    }: RunContext<ArchiveOptions>): Promise<void> {
        const { repositoryRoot, currentWorkingDirectory } = context;
        const { yes, json } = parsedArguments.args;
        const [name, description] = parsedArguments.rest as [string, string];
        const confirm = (): boolean => {
            writeSync(
                Deno.stderr,
                'Pause source edits and ticket or plan updates until archive apply finishes.\n',
            );
            if (yes) {
                return true;
            }
            if (configuration.nonInteractive || Log.nonInteractive) {
                throw new Error(
                    'Archive apply requires approval. Run in a terminal or use --yes after approval.',
                );
            }
            return Log.confirm('Record and remove the eligible archive files?', { default: false });
        };
        const result = await applyArchive(
            repositoryRoot ?? currentWorkingDirectory,
            name,
            description,
            confirm,
            signal,
            currentWorkingDirectory,
        ).catch((error: unknown) => {
            if (signal.aborted) {
                Log.error(error);
            }
            throw error;
        });
        if (json) {
            writeArchiveJson(result);
        } else if (result.status === 'applied') {
            Log.output(
                `Recorded archive batch ${result.batchId} at ${result.archiveCommit}. Removed ${result.paths.length} source files.`,
            );
        } else {
            Log.output(
                result.status === 'empty'
                    ? 'No eligible files to archive.'
                    : 'Archive apply declined.',
            );
        }
    }
}
