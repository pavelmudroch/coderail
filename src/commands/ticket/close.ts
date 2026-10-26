import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { Path } from '@path';
import { join, relative } from '@std/path';
import { resolveTicket, TICKET_STATUS } from './helpers/resolve-ticket.ts';

type CloseArguments = {
    help: boolean;
    ticketId: string;
    json: boolean;
    reason: 'done' | 'duplicate' | 'dismissed';
    duplicateOf?: string;
};

export class Close implements Command<CloseArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<CloseArguments> {
        const args: CloseArguments = {
            help: false,
            ticketId: '',
            json: false,
            reason: 'done',
        };
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
                const positional = originalArgs.slice(i + 1);
                if (!args.ticketId) {
                    args.ticketId = positional.shift() ?? '';
                }
                rest.push(...positional);
                break;
            }
            if (arg === '-r' || arg === '--reason' || arg.startsWith('--reason=')) {
                const value = arg.startsWith('--reason=')
                    ? arg.slice('--reason='.length)
                    : originalArgs[++i];
                if (!value || value.startsWith('-')) {
                    Cli.raiseUsageError('Option "--reason" requires a value.', this);
                }
                if (value !== 'done' && value !== 'duplicate' && value !== 'dismissed') {
                    Cli.raiseUsageError(
                        'Reason must be "done", "duplicate", or "dismissed".',
                        this,
                    );
                }
                args.reason = value;
                continue;
            }
            if (
                arg === '-d' || arg === '--duplicate-of' || arg.startsWith('--duplicate-of=')
            ) {
                const value = arg.startsWith('--duplicate-of=')
                    ? arg.slice('--duplicate-of='.length)
                    : originalArgs[++i];
                if (!value || value.startsWith('-')) {
                    Cli.raiseUsageError('Option "--duplicate-of" requires a value.', this);
                }
                if (!/^\d{4,}$/.test(value)) {
                    Cli.raiseUsageError(
                        'Duplicate ticket ID must contain at least four digits.',
                        this,
                    );
                }
                args.duplicateOf = value;
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
            if (!args.ticketId) {
                args.ticketId = arg;
                continue;
            }
            rest.push(arg);
        }
        if (rest.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        if (!args.ticketId) {
            Cli.raiseUsageError('Missing required ticket ID.', this);
        }
        if (!/^\d{4,}$/.test(args.ticketId)) {
            Cli.raiseUsageError('Ticket ID must contain at least four digits.', this);
        }
        if (args.reason === 'duplicate') {
            if (args.duplicateOf === undefined) {
                Cli.raiseUsageError('Reason "duplicate" requires option "--duplicate-of".', this);
            }
            if (args.duplicateOf === args.ticketId) {
                Cli.raiseUsageError('A ticket cannot be a duplicate of itself.', this);
            }
        } else if (args.duplicateOf !== undefined) {
            Cli.raiseUsageError('Option "--duplicate-of" requires reason "duplicate".', this);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<CloseArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket close [--help] [--json] [--reason <done | dismissed>] <ticket-id>',
            '  cr ticket close [--help] [--json] --reason duplicate --duplicate-of <ticket-id>',
            '                  <ticket-id>',
            '',
            '  Close the currently open or active ticket with the given ticket ID.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '  -r, --reason <done | duplicate | dismissed>',
            '                       Reason for closing the ticket. Defaults to "done".',
            '  -d, --duplicate-of <ticket-id>',
            '                       Specify the ticket ID that this ticket is a duplicate of.',
            '                       This option is only allowed and required when the reason',
            '                       is set to "duplicate".',
            '',
            'Arguments:',
            '  <ticket-id>          ID of the ticket to close.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<CloseArguments>): Promise<void> {
        const id = context.parsedArguments.args.ticketId;
        const cwd = context.context.currentWorkingDirectory;
        try {
            const ticket = await resolveTicket(cwd, id);
            if (ticket.status !== TICKET_STATUS.OPEN && ticket.status !== TICKET_STATUS.ACTIVE) {
                throw new Error(`Ticket "${id}" is not open or active.`);
            }
            const { reason, duplicateOf } = context.parsedArguments.args;
            if (duplicateOf !== undefined) {
                await resolveTicket(cwd, duplicateOf);
            }
            const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR, 'closed');
            const path = join(directory, `${id}-${ticket.slug}.md`);
            if (await Fs.exists(path)) {
                throw new Error(`Ticket with "${path}" already exists.`);
            }
            await Fs.makeDirectory(directory);
            const markdown = await Md.parse(await Fs.read(ticket.path, { text: true }));
            markdown.frontmatter.status = TICKET_STATUS.CLOSED;
            markdown.frontmatter.reason = reason;
            if (duplicateOf !== undefined) {
                markdown.frontmatter['duplicate-of'] = duplicateOf;
            } else {
                delete markdown.frontmatter['duplicate-of'];
            }
            markdown.frontmatter.updated_at = new Date().toISOString();
            await Fs.write(path, Md.toStream(markdown));
            await Deno.remove(ticket.path);
            if (context.parsedArguments.args.json) {
                Log.output(JSON.stringify([{ path, ...markdown.frontmatter }], null, 4));
                return;
            }
            Log.output(relative(cwd, path));
        } catch (error) {
            throw new Error(`Cannot close ticket "${id}"`, { cause: error });
        }
    }
}
