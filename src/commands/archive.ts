import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';

import { selectArchive } from '../archive/selection.ts';

type ArchiveArguments = {
    help: boolean;
    command?: string;
};

export class Archive implements Command<ArchiveArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ArchiveArguments> {
        const firstNonJson = originalArgs.findIndex((arg) => arg !== '--json');
        const commandIndex = firstNonJson === -1 ? originalArgs.length : firstNonJson;
        const command = originalArgs[commandIndex];
        const rest = originalArgs.slice(0, commandIndex);
        const args: ArchiveArguments = { help: command === '-h' || command === '--help' };
        if (command !== undefined && !args.help) {
            if (command.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${command}".`, this);
            }
            args.command = command;
            rest.push(...originalArgs.slice(commandIndex + 1));
        }
        return { args, rest };
    }

    shouldHandleHelp({ args }: ParsedArguments<ArchiveArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive [--help] [--json] <command>',
            '',
            'Commands:',
            '  preview              Show which tickets and plans can be archived.',
        ].join('\n');
    }

    getSubcommand({ args }: ParsedArguments<ArchiveArguments>): Command {
        switch (args.command) {
            case 'preview':
                return new Preview();
            case undefined:
                Cli.raiseUsageError('Required archive subcommand is missing.', this);
            default:
                Cli.raiseUsageError(`Unknown archive subcommand "${args.command}".`, this);
        }
    }

    run(): Promise<void> {
        return Promise.resolve();
    }
}

type PreviewArguments = { help: boolean; json: boolean };

export class Preview implements Command<PreviewArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<PreviewArguments> {
        const args = { help: false, json: false };
        for (const arg of originalArgs) {
            switch (arg) {
                case '-h':
                case '--help':
                    args.help = true;
                    return { args, rest: [] };
                case '--json':
                    args.json = true;
                    break;
                default:
                    Cli.raiseUsageError(`Unexpected archive preview argument "${arg}".`, this);
            }
        }
        return { args, rest: [] };
    }

    shouldHandleHelp({ args }: ParsedArguments<PreviewArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr archive preview [--help] [--json]',
            '',
            '  Preview eligible archive groups and explain why other groups must stay.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<PreviewArguments>): Promise<void> {
        const { repositoryRoot, currentWorkingDirectory } = context;
        const selection = await selectArchive(repositoryRoot ?? currentWorkingDirectory, signal);
        if (parsedArguments.args.json) {
            Log.output(JSON.stringify(selection, null, 2));
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
