import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Log } from '@log';
import { Path } from '@path';
import { join } from '@std/path';
import { formatJson, formatText } from './helpers/format.ts';
import { areDependenciesSatisfied } from './helpers/are-dependencies-satisfied.ts';
import { resolveTicket, type Ticket, TICKET_STATUS } from './helpers/resolve-ticket.ts';

type NextArguments = {
    help: boolean;
    json: boolean;
    limit?: number;
};

export class Next implements Command<NextArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<NextArguments> {
        const args: NextArguments = { help: false, json: false };
        const rest: string[] = [];
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) continue;
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest };
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg === '--') {
                rest.push(...originalArgs.slice(i + 1));
                break;
            }
            if (arg === '-l' || arg === '--limit' || arg.startsWith('--limit=')) {
                const value = arg.startsWith('--limit=')
                    ? arg.slice('--limit='.length)
                    : originalArgs[++i];
                if (value === undefined || value === '') {
                    Cli.raiseUsageError('Option "--limit" requires a value.', this);
                }
                if (
                    !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
                    Number(value) < 1
                ) {
                    Cli.raiseUsageError('Limit must be a positive integer.', this);
                }
                args.limit = Number(value);
                continue;
            }
            if (arg === '--json') {
                args.json = true;
                continue;
            }
            if (arg.startsWith('--json=')) {
                Cli.raiseUsageError('Option "--json" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            rest.push(arg);
        }
        if (rest.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<NextArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket next [--help] [--json] [--limit <number>]',
            '',
            '  Get the next available tickets in ascending ticket ID order.',
            '  Available tickets are open with all dependencies satisfied.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '  -l, --limit <number> Limit the number of tickets to retrieve (defaults: all).',
            '                       Must be a positive integer.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<NextArguments>): Promise<void> {
        const cwd = context.context.currentWorkingDirectory;
        try {
            const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR, 'open');
            const ids: string[] = [];
            try {
                for await (const entry of Deno.readDir(directory)) {
                    if (!entry.isFile) continue;
                    const match = /^(\d{4,})-.+\.md$/.exec(entry.name);
                    const id = match?.[1];
                    if (id !== undefined) ids.push(id);
                }
            } catch (error) {
                if (!(error instanceof Deno.errors.NotFound)) throw error;
            }
            ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
            const tickets: Ticket[] = [];
            for (const id of ids) {
                const ticket = await resolveTicket(cwd, id);
                if (ticket.status !== TICKET_STATUS.OPEN) continue;
                let satisfied = true;
                for (const dependency of ticket.dependencies) {
                    if (!await areDependenciesSatisfied(cwd, dependency)) {
                        satisfied = false;
                        break;
                    }
                }
                if (!satisfied) continue;
                tickets.push(ticket);
                if (tickets.length === context.parsedArguments.args.limit) break;
            }
            if (context.parsedArguments.args.json) {
                Log.output(formatJson(tickets));
                return;
            }
            if (tickets.length > 0) {
                Log.output(formatText(tickets));
            }
        } catch (error) {
            throw new Error('Cannot get next tickets', { cause: error });
        }
    }
}
