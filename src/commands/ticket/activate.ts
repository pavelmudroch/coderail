import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { Path } from '@path';
import { join } from '@std/path';
import { formatJson, formatText } from './helpers/format.ts';
import { resolveTicket, TICKET_STATUS } from './helpers/resolve-ticket.ts';

type ActivateArguments = {
    help: boolean;
    ticketId: string;
    json: boolean;
};

export class Activate implements Command<ActivateArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ActivateArguments> {
        const args: ActivateArguments = { help: false, ticketId: '', json: false };
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
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<ActivateArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket activate [--help] [--json] <ticket-id>',
            '',
            '  Activate the currently open ticket with the given ticket ID.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '',
            'Arguments:',
            '  <ticket-id>          ID of the ticket to activate.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<ActivateArguments>): Promise<void> {
        const id = context.parsedArguments.args.ticketId;
        const cwd = context.context.currentWorkingDirectory;
        try {
            const ticket = await resolveTicket(cwd, id);
            if (ticket.status !== TICKET_STATUS.OPEN) {
                throw new Error(`Ticket "${id}" is not open.`);
            }
            const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR, 'active');
            const path = join(directory, `${id}-${ticket.slug}.md`);
            if (await Fs.exists(path)) {
                throw new Error(`Ticket with "${path}" already exists.`);
            }
            await Fs.makeDirectory(directory);
            const markdown = await Md.parse(await Fs.read(ticket.path, { text: true }));
            markdown.frontmatter.status = TICKET_STATUS.ACTIVE;
            markdown.frontmatter.updated_at = new Date().toISOString();
            await Fs.write(path, Md.toStream(markdown));
            await Deno.remove(ticket.path);
            const result = await resolveTicket(cwd, id);
            if (context.parsedArguments.args.json) {
                Log.output(formatJson([result]));
                return;
            }
            Log.output(formatText([result]));
        } catch (error) {
            throw new Error(`Cannot activate ticket "${id}"`, { cause: error });
        }
    }
}
