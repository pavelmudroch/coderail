import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';
import { Log } from '@log';

import type { RunContext } from './helpers/command.ts';
import { Activate } from './ticket/activate.ts';
import { Close } from './ticket/close.ts';
import { Create } from './ticket/create.ts';
import { getTicketList, type TicketListItem } from './ticket/get-ticket-list.ts';
import { Next } from './ticket/next.ts';
import { Reopen } from './ticket/reopen.ts';

type TicketArguments = {
    help: boolean;
    json: boolean;
    command?: string;
};

export class Ticket implements Command<TicketArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<TicketArguments> {
        const args: TicketArguments = { help: false, json: false };
        const rest: string[] = [];
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest };
            }
            if (arg === '--json') {
                args.json = true;
                rest.push(arg);
                continue;
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg.startsWith('--json=')) {
                Cli.raiseUsageError('Option "--json" does not take a value.', this);
            }
            if (arg === '--') {
                args.command = originalArgs[i + 1];
                rest.push(...originalArgs.slice(i + 2));
                return { args, rest };
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.command = arg;
            rest.push(...originalArgs.slice(i + 1));
            return { args, rest };
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<TicketArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr ticket [--help] [--json] <command>',
            '',
            '  Management of tickets.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output the result in JSON format.',
            '',
            'Commands:',
            '  next                 Show filtered list of the next tickets.',
            '  create               Create a new ticket.',
            '  close                Close an existing ticket.',
            '  activate             Activate an existing ticket.',
            '  reopen               Reopen a closed ticket.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(parsedArguments: ParsedArguments<TicketArguments>): Command | undefined {
        switch (parsedArguments.args.command) {
            case 'next':
                return new Next();
            case 'create':
                return new Create();
            case 'close':
                return new Close();
            case 'activate':
                return new Activate();
            case 'reopen':
                return new Reopen();
            case undefined:
                return undefined;
            default:
                Cli.raiseUsageError(
                    `Unknown ticket subcommand "${parsedArguments.args.command}".`,
                    this,
                );
        }
    }

    async run(context: RunContext<TicketArguments>): Promise<void> {
        const tickets = await getTicketList();
        if (context.parsedArguments.args.json) {
            const jsonOutput = JSON.stringify(tickets, null, 4);
            Log.output(jsonOutput);
            return;
        }

        const ticketTree = buildTicketTree(tickets);
        printTicketTreeFloor(ticketTree, { prefix: '' });
    }
}

type TicketTreeNode = {
    ticket: TicketListItem;
    children: TicketTreeNode[];
};

function buildTicketTree(tickets: TicketListItem[]): TicketTreeNode[] {
    const nodes = new Map<string, TicketTreeNode>();
    for (const ticket of tickets) {
        nodes.set(ticket.id, { ticket, children: [] });
    }

    const roots: TicketTreeNode[] = [];
    for (const node of nodes.values()) {
        let hasParent = false;
        for (const dependency of new Set(node.ticket.dependsOn)) {
            const parent = nodes.get(dependency);
            if (parent !== undefined) {
                parent.children.push(node);
                hasParent = true;
            }
        }
        if (!hasParent) {
            roots.push(node);
        }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    function checkForCycles(node: TicketTreeNode): void {
        if (visiting.has(node.ticket.id)) {
            throw new Error(`Circular ticket dependency: ${node.ticket.id}`);
        }
        if (visited.has(node.ticket.id)) {
            return;
        }
        visiting.add(node.ticket.id);
        for (const child of node.children) {
            checkForCycles(child);
        }
        visiting.delete(node.ticket.id);
        visited.add(node.ticket.id);
    }
    for (const node of nodes.values()) {
        checkForCycles(node);
    }

    return roots;
}

type PrintOptions = {
    prefix: string;
};

function printTicketTreeFloor(ticketTree: TicketTreeNode[], { prefix }: PrintOptions): void {
    for (const [index, node] of ticketTree.entries()) {
        const isLast = index === ticketTree.length - 1;
        const branchPrefix = prefix + (isLast ? '└── ' : '├── ');
        const continuationPrefix = prefix + (isLast ? '    ' : '│   ');
        const id = branchPrefix + Log.color.yellow(node.ticket.id);
        const title = Log.color.cyan(node.ticket.title);
        const path = continuationPrefix + Log.color.green(node.ticket.path);
        const details =
            continuationPrefix +
            Log.color.gray(`created: ${node.ticket.createdAt}, updated: ${node.ticket.updatedAt}`);
        const status = getStatus(node);
        const statusLine = `${continuationPrefix}${Log.color.gray('[')} ${status} ${Log.color.gray(']')}`;
        Log.output(id, title);
        Log.output(statusLine);
        Log.output(path);
        Log.output(details);
        if (node.children.length > 0) {
            printTicketTreeFloor(node.children, { prefix: continuationPrefix });
        }
    }
}

function getStatus(node: TicketTreeNode): string {
    if (node.ticket.status === 'open') {
        return Log.color.red('open');
    }

    if (node.ticket.status === 'active') {
        return Log.color.yellow('active');
    }

    if (node.ticket.status !== 'closed') {
        return Log.color.gray('unknown');
    }

    const statusDetails: string[] = [];
    if (node.ticket.reason === 'done') {
        statusDetails.push(Log.color.green('closed'));
        statusDetails.push(Log.color.green(node.ticket.reason));
        return statusDetails.join(' ');
    }

    if (node.ticket.reason === 'duplicate') {
        statusDetails.push(Log.color.green('closed'));
        statusDetails.push(Log.color.green(node.ticket.reason));
        statusDetails.push(Log.color.yellow(`duplicate of: ${node.ticket.duplicateOf}`));
        return statusDetails.join(' ');
    }

    statusDetails.push(Log.color.orange('closed'));
    statusDetails.push(Log.color.orange(node.ticket.reason));
    return statusDetails.join(' ');
}
