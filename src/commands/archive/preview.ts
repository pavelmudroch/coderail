import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';

import { selectArchive } from '../../archive/selection.ts';
import { writeArchiveJson } from './helpers/output.ts';
import { type ArchiveOptions, parseArchiveArguments } from './helpers/parse-arguments.ts';

export class Preview implements Command<ArchiveOptions> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveOptions> {
        return parseArchiveArguments(originalArgs, this, 0);
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveOptions>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive preview [--help] [--json]',
            '',
            '  Preview eligible archive groups and explain why other groups must stay.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the selection in JSON format.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<ArchiveOptions>): Promise<void> {
        const { repositoryRoot, currentWorkingDirectory } = context;
        const selection = await selectArchive(repositoryRoot ?? currentWorkingDirectory, signal);
        if (parsedArguments.args.json) {
            writeArchiveJson(selection);
            return;
        }
        const lines = [
            `Source commit: ${selection.sourceCommit}`,
            '',
            `Eligible groups: ${selection.eligible.length}`,
        ];
        for (const { paths } of selection.eligible) {
            lines.push('', ...paths.map((path) => `  ${path}`));
        }
        lines.push('', `Deferred groups: ${selection.deferred.length}`);
        for (const { paths, reasons } of selection.deferred) {
            lines.push(
                '',
                ...paths.map((path) => `  ${path}`),
                ...reasons.map((reason) => `    ${reason}`),
            );
        }
        Log.output(lines.join('\n'));
    }
}
