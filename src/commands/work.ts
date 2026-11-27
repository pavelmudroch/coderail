import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';
import { abbreviateWorkCommit, getWorkStatus } from '@work';

import { Start } from './work/start.ts';

type WorkArguments = {
    help: boolean;
    json: boolean;
    command?: string;
};

export class Work implements Command<WorkArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<WorkArguments> {
        const args: WorkArguments = { help: false, json: false };
        for (const [index, arg] of originalArgs.entries()) {
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg === '--json') {
                args.json = true;
                continue;
            }
            if (arg.startsWith('--help=') || arg.startsWith('--json=')) {
                const [option] = arg.split('=', 1);
                Cli.raiseUsageError(`Option "${option}" does not take a value.`, this);
            }
            if (arg === '--') {
                args.command = originalArgs[index + 1];
                return { args, rest: originalArgs.slice(index + 2) };
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.command = arg;
            return { args, rest: originalArgs.slice(index + 1) };
        }
        return { args, rest: [] };
    }

    shouldHandleHelp({ args }: ParsedArguments<WorkArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr work [--help] [--json] [<command>]',
            '',
            '  Show the current work context and review range.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --json           Output work status in JSON format.',
            '',
            'Commands:',
            '  start                Create and switch to a work branch.',
        ].join('\n');
    }

    getSubcommand({ args }: ParsedArguments<WorkArguments>): Command | undefined {
        if (args.command === undefined) {
            return undefined;
        }
        if (args.command !== 'start') {
            Cli.raiseUsageError(`Unknown work subcommand "${args.command}".`, this);
        }
        if (args.json) {
            Cli.raiseUsageError('Option "--json" is available only for work status.', this);
        }
        return new Start();
    }

    async run({ context, parsedArguments, signal }: RunContext<WorkArguments>): Promise<void> {
        const cwd = context.currentWorkingDirectory;
        const status = await getWorkStatus(cwd, signal);
        if (parsedArguments.args.json) {
            Log.output(JSON.stringify(status, null, 4));
            return;
        }

        const [base, head] = await Promise.all([
            abbreviateWorkCommit(cwd, signal, status.baseCommit),
            abbreviateWorkCommit(cwd, signal, status.headCommit),
        ]);
        const unavailable = 'unavailable';
        const range = base !== null && head !== null ? `${base}..${head}` : unavailable;
        Log.output(
            [
                `Work: ${status.work ?? 'none'}`,
                `Branch: ${status.branch ?? unavailable}`,
                `Upstream: ${status.upstream ?? unavailable}`,
                `Base: ${base ?? unavailable}`,
                `HEAD: ${head ?? unavailable}`,
                `Review range: ${range}`,
            ].join('\n'),
        );
    }
}
