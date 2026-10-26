import type { Command, ParsedArguments, RunContext } from '@commands';
import { Cli } from '@cli';
import { Fs } from '@fs';
import { Log } from '@log';
import { Md } from '@md';
import { Path } from '@path';
import { join, relative } from '@std/path';
import { resolveTicket, TICKET_STATUS } from './helpers/resolve-ticket.ts';

type ReopenArguments = {
    help: boolean;
    ticketId: string;
    json: boolean;
    dependsOn: string[];
};

export class Reopen implements Command<ReopenArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<ReopenArguments> {
        const args: ReopenArguments = { help: false, ticketId: '', json: false, dependsOn: [] };
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
        if (args.dependsOn.includes(args.ticketId)) {
            Cli.raiseUsageError('A ticket cannot depend on itself.', this);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<ReopenArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket reopen [--help] [--json] [--depends-on <ticket-id>] <ticket-id>',
            '',
            '  Reopen a ticket in any state, optionally adding dependencies.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '  -d, --depends-on <ticket-id>',
            '                       Add a dependency. Can be specified multiple times.',
            '',
            'Arguments:',
            '  <ticket-id>          ID of the ticket to reopen.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<ReopenArguments>): Promise<void> {
        const id = context.parsedArguments.args.ticketId;
        const cwd = context.context.currentWorkingDirectory;
        try {
            const ticket = await resolveTicket(cwd, id);
            const dependencies = context.parsedArguments.args.dependsOn;
            for (const dependency of dependencies) {
                await resolveTicket(cwd, dependency);
            }
            const directory = join(cwd, Path.CODERAIL_DIR, Path.TICKETS_DIR, 'open');
            const path = join(directory, `${id}-${ticket.slug}.md`);
            const moving = ticket.status !== TICKET_STATUS.OPEN;
            if (moving && await Fs.exists(path)) {
                throw new Error(`Ticket with "${path}" already exists.`);
            }
            const markdown = await Md.parse(await Fs.read(ticket.path, { text: true }));
            let changed = moving || Object.hasOwn(markdown.frontmatter, 'reason') ||
                Object.hasOwn(markdown.frontmatter, 'duplicate-of');
            delete markdown.frontmatter.reason;
            delete markdown.frontmatter['duplicate-of'];
            if (dependencies.length > 0) {
                const merged = [...ticket.dependencies];
                for (const dependency of dependencies) {
                    if (!merged.includes(dependency)) {
                        merged.push(dependency);
                        changed = true;
                    }
                }
                if (changed) markdown.frontmatter.dependencies = merged;
            }
            if (changed) {
                markdown.frontmatter.status = TICKET_STATUS.OPEN;
                markdown.frontmatter.updated_at = new Date().toISOString();
                await Fs.makeDirectory(directory);
                await Fs.write(path, Md.toStream(markdown));
                if (moving) await Deno.remove(ticket.path);
            } else {
                await markdown.content.cancel();
            }
            if (context.parsedArguments.args.json) {
                Log.output(JSON.stringify([{ path, ...markdown.frontmatter }], null, 4));
                return;
            }
            Log.output(relative(cwd, path));
        } catch (error) {
            throw new Error(`Cannot reopen ticket "${id}"`, { cause: error });
        }
    }
}
