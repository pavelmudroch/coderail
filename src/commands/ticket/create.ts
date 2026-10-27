import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Text } from '@utils';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { Path } from '@path';
import { join } from '@std/path';
import { formatJson, formatText } from './helpers/format.ts';
import { getLastTicketId } from './helpers/get-last-ticket-id.ts';
import { formatTicketId } from './helpers/format-ticket-id.ts';
import { resolveTicket, type Ticket } from './helpers/resolve-ticket.ts';

type CreateArguments = {
    help: boolean;
    ticketTitle: string;
    dependsOn: string[];
    json: boolean;
};

export class Create implements Command<CreateArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<CreateArguments> {
        const args: CreateArguments = {
            help: false,
            ticketTitle: '',
            dependsOn: [],
            json: false,
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
                if (!args.ticketTitle) {
                    args.ticketTitle = positional.shift() ?? '';
                }
                rest.push(...positional);
                break;
            }
            if (arg === '-d' || arg === '--depends-on' || arg.startsWith('--depends-on=')) {
                const value = arg.startsWith('--depends-on=')
                    ? arg.slice('--depends-on='.length)
                    : originalArgs[++i];
                if (!value || value.startsWith('-')) {
                    Cli.raiseUsageError('Option "--depends-on" requires a value.', this);
                }
                if (!/^\d{4,}$/.test(value)) {
                    Cli.raiseUsageError(
                        'Dependency must be a ticket ID with at least four digits.',
                        this,
                    );
                }
                if (!args.dependsOn.includes(value)) args.dependsOn.push(value);
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
            if (!args.ticketTitle) {
                args.ticketTitle = arg;
                continue;
            }
            rest.push(arg);
        }
        if (rest.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        if (!args.ticketTitle.trim()) {
            Cli.raiseUsageError('Missing required ticket title.', this);
        }
        const slug = Text.slugify(args.ticketTitle);
        if (!slug || /[/\\]/.test(args.ticketTitle)) {
            Cli.raiseUsageError(
                'Ticket title must produce a nonempty slug and must not contain path separators.',
                this,
            );
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<CreateArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket create [--help] [--json] [--depends-on <ticket-id>] <title>',
            '',
            '  Create a new ticket with the given title.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '  -d, --depends-on <ticket-id>',
            '                       Specify a ticket that this new ticket depends on.',
            '                       This option can be used multiple times to specify',
            '                       multiple dependencies.',
            '',
            'Arguments:',
            '  <title>              Title of the ticket to create.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<CreateArguments>): Promise<void> {
        const title = context.parsedArguments.args.ticketTitle;
        const slug = Text.slugify(title);
        const dependencies = context.parsedArguments.args.dependsOn;
        const cwd = context.context.currentWorkingDirectory;
        const ticketsDirectory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR);

        try {
            const nextId = (await getLastTicketId(cwd) ?? 0) + 1;
            if (!Number.isSafeInteger(nextId)) {
                throw new Error('Cannot allocate a safe ticket ID.');
            }
            if (dependencies.length > 0) {
                const dependencyPromises: Promise<Ticket>[] = [];
                for (const dependency of dependencies) {
                    const ticketPromise = resolveTicket(cwd, dependency);
                    dependencyPromises.push(ticketPromise);
                }
                await Promise.all(dependencyPromises);
            }

            const id = formatTicketId(nextId);
            const directory = join(ticketsDirectory, 'open');
            const path = join(directory, `${id}-${slug}.md`);
            if (await Fs.exists(path)) {
                throw new Error(`Ticket with "${path}" already exists.`);
            }
            const timestamp = new Date().toISOString();
            const frontmatter = {
                id,
                slug,
                title,
                status: 'open',
                created_at: timestamp,
                updated_at: timestamp,
                dependencies,
            };
            const markdown = Md.create('', frontmatter);
            await Fs.makeDirectory(directory);
            await Fs.write(path, Md.toStream(markdown));
            const result = await resolveTicket(cwd, id);
            if (context.parsedArguments.args.json) {
                Log.output(formatJson([result]));
                return;
            }
            Log.output(formatText([result]));
        } catch (error) {
            throw new Error(`Cannot create ticket "${title}"`, { cause: error });
        }
    }
}
