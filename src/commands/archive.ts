import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';

import { applyArchive } from '../archive/apply.ts';
import {
    listArchiveBatches,
    listArchivedPlans,
    listArchivedTickets,
    readArchivedFile,
} from '../archive/history.ts';
import { selectArchive } from '../archive/selection.ts';
import { writeSync } from '../log/helpers/write-sync.ts';

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
            '  apply [--yes] <batch-name> <description>  Record and remove eligible files.',
            '  list                 List retained archive batches.',
            '  plans <batch-id>     List archived plans and their artifacts.',
            '  tickets <batch-id>   List archived tickets.',
            '  read <path>          Read an archived file by its batch-relative listing path.',
        ].join('\n');
    }

    getSubcommand({ args }: ParsedArguments<ArchiveArguments>): Command {
        switch (args.command) {
            case 'preview':
                return new Preview();
            case 'apply':
                return new Apply();
            case 'list':
            case 'plans':
            case 'tickets':
            case 'read':
                return new BrowseArchive(args.command);
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

type BrowseCommand = 'list' | 'plans' | 'tickets' | 'read';
type BrowseArguments = { help: boolean; json: boolean; target: string };
const browseUsage = {
    list: 'cr archive list [--help] [--json]',
    plans: 'cr archive plans [--help] [--json] <batch-id>',
    tickets: 'cr archive tickets [--help] [--json] <batch-id>',
    read: 'cr archive read [--help] <batch-id>/<path-to-file>',
};

export class BrowseArchive implements Command<BrowseArguments> {
    readonly requiresInit = false;

    constructor(private readonly command: BrowseCommand) {}

    parseArguments(originalArgs: readonly string[]): ParsedArguments<BrowseArguments> {
        const args = { help: false, json: false, target: '' };
        for (const arg of originalArgs) {
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg === '--json') {
                args.json = true;
                continue;
            }
            if (
                arg === '' ||
                arg.startsWith('-') ||
                this.command === 'list' ||
                args.target !== ''
            ) {
                Cli.raiseUsageError(`Unexpected archive ${this.command} argument "${arg}".`, this);
            }
            args.target = arg;
        }
        if (this.command !== 'list' && args.target === '') {
            const required = this.command === 'read' ? 'an archived file path' : 'a batch ID';
            Cli.raiseUsageError(`Archive ${this.command} requires ${required}.`, this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp({ args }: ParsedArguments<BrowseArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return `Usage:\n  ${browseUsage[this.command]}`;
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<BrowseArguments>): Promise<void> {
        const root = context.currentWorkingDirectory;
        const { target, json } = parsedArguments.args;
        switch (this.command) {
            case 'list': {
                const batches = await listArchiveBatches(root, signal);
                printArchiveListing(batches, json, () => batches, 'No archive batches.');
                break;
            }
            case 'plans': {
                const plans = await listArchivedPlans(root, target, signal);
                printArchiveListing(
                    plans,
                    json,
                    () =>
                        plans.flatMap(({ title, path, parent, artifacts }) => [
                            `${title}  ${path}`,
                            ...(parent === null ? [] : [`  Parent: ${parent}`]),
                            ...artifacts.map((artifact) => `  ${artifact}`),
                        ]),
                    `No archived plans in "${target}".`,
                );
                break;
            }
            case 'tickets': {
                const tickets = await listArchivedTickets(root, target, signal);
                printArchiveListing(
                    tickets,
                    json,
                    () => tickets.map(({ id, title, path }) => `${id}  ${title}  ${path}`),
                    `No archived tickets in "${target}".`,
                );
                break;
            }
            case 'read':
                writeSync(Deno.stdout, await readArchivedFile(root, target, signal));
                break;
        }
    }
}

function printArchiveListing(
    items: readonly unknown[],
    json: boolean,
    lines: () => string[],
    emptyMessage: string,
): void {
    if (json) {
        writeArchiveJson(items);
    } else {
        Log.output(items.length === 0 ? emptyMessage : lines().join('\n'));
    }
}

export function writeArchiveJson(value: unknown): void {
    writeSync(Deno.stdout, `${JSON.stringify(value, null, 2)}\n`);
}

type ApplyArguments = {
    help: boolean;
    json: boolean;
    yes: boolean;
    name: string;
    description: string;
};

export class Apply implements Command<ApplyArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ApplyArguments> {
        const args = { help: false, json: false, yes: false, name: '', description: '' };
        const positional = [];
        let options = true;
        for (const arg of originalArgs) {
            if (options) {
                switch (arg) {
                    case '--':
                        options = false;
                        continue;
                    case '-h':
                    case '--help':
                        args.help = true;
                        return { args, rest: [] };
                    case '--json':
                        args.json = true;
                        continue;
                    case '--yes':
                        args.yes = true;
                        continue;
                }
                if (arg.startsWith('-')) {
                    Cli.raiseUsageError(`Unknown archive apply option "${arg}".`, this);
                }
            }
            positional.push(arg);
        }
        if (positional.length !== 2) {
            Cli.raiseUsageError('Archive apply requires a batch name and a description.', this);
        }
        [args.name, args.description] = positional as [string, string];
        return { args, rest: [] };
    }

    shouldHandleHelp({ args }: ParsedArguments<ApplyArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return 'Usage:\n  cr archive apply [--help] [--json] [--yes] <batch-name> <description>';
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({
        context,
        configuration,
        parsedArguments,
        signal,
    }: RunContext<ApplyArguments>): Promise<void> {
        const { repositoryRoot, currentWorkingDirectory } = context;
        const { name, description, yes, json } = parsedArguments.args;
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
