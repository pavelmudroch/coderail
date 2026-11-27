import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Log } from '@log';
import { startWork } from '@work';

type StartArguments = {
    help: boolean;
    workName: string;
};

export class Start implements Command<StartArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<StartArguments> {
        const positional: string[] = [];
        for (const [index, arg] of originalArgs.entries()) {
            if (arg === '-h' || arg === '--help') {
                return { args: { help: true, workName: '' }, rest: [] };
            }
            if (arg === '--') {
                positional.push(...originalArgs.slice(index + 1));
                break;
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            positional.push(arg);
        }

        const [workName, ...extra] = positional;
        if (workName === undefined || workName.trim() === '') {
            Cli.raiseUsageError('Missing required work name.', this);
        }
        if (extra.length > 0) {
            Cli.raiseUsageError(`Unexpected arguments: ${extra.join(' ')}`, this);
        }
        return { args: { help: false, workName }, rest: [] };
    }

    shouldHandleHelp({ args }: ParsedArguments<StartArguments>): boolean {
        return args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr work start [--help] <work-name>',
            '',
            '  Create and switch to a work branch that tracks the current local branch.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '',
            'Arguments:',
            '  <work-name>          Name for the new work branch.',
        ].join('\n');
    }

    getSubcommand(): undefined {
        return undefined;
    }

    async run({ context, parsedArguments, signal }: RunContext<StartArguments>): Promise<void> {
        const branch = await startWork(
            context.currentWorkingDirectory,
            parsedArguments.args.workName,
            signal,
        );
        Log.output(`Started work on ${branch}.`);
    }
}
