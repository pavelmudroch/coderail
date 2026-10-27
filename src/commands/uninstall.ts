import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Harness } from '@harness';
import { Cli } from '@cli';
import { runInstructionOperation } from './helpers/run-instruction-operation.ts';

type UninstallArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
    self: boolean;
    harnesses: string[];
};

export class Uninstall implements Command<UninstallArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<UninstallArguments> {
        const args: UninstallArguments = {
            help: false,
            force: false,
            yes: false,
            no: false,
            self: false,
            harnesses: [],
        };
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg.startsWith('--help=')) {
                Cli.raiseUsageError('Option "--help" does not take a value.', this);
            }
            if (arg === '--') {
                args.harnesses.push(...originalArgs.slice(i + 1));
                break;
            }
            if (arg === '-f' || arg === '--force') {
                args.force = true;
                continue;
            }
            if (arg.startsWith('--force=')) {
                Cli.raiseUsageError('Option "--force" does not take a value.', this);
            }
            if (arg === '-y' || arg === '--yes') {
                args.yes = true;
                continue;
            }
            if (arg.startsWith('--yes=')) {
                Cli.raiseUsageError('Option "--yes" does not take a value.', this);
            }
            if (arg === '-n' || arg === '--no') {
                args.no = true;
                continue;
            }
            if (arg.startsWith('--no=')) {
                Cli.raiseUsageError('Option "--no" does not take a value.', this);
            }
            if (arg === '--self') {
                args.self = true;
                continue;
            }
            if (arg.startsWith('--self=')) {
                Cli.raiseUsageError('Option "--self" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.harnesses.push(arg);
        }
        if (args.self && args.harnesses.length > 0) {
            Cli.raiseUsageError('Option "--self" cannot be used with specified harnesses.', this);
        }
        if (args.yes && args.no) {
            Cli.raiseUsageError('Options "--yes" and "--no" cannot be used together.', this);
        }
        if ((args.yes || args.no) && !args.force) {
            Cli.raiseUsageError('Options "--yes" and "--no" require "--force".', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<UninstallArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr uninstall [--help] [--force [--yes | --no]] [--self | <harness> ...]',
            '',
            '  Uninstall custom coderail instructions for specific harness.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -f, --force          Force uninstallation to allow removing modified',
            '                       instructions. Requires confirmation prompt before each',
            '                       action.',
            '  -y, --yes            Automatically answer "yes" to all prompts.',
            '  -n, --no             Automatically answer "no" to all prompts.',
            '      --self           Uninstall coderail tool itself. Cannot be used with',
            '                       specified harness.',
            '',
            'Arguments:',
            '  <harness>            The harness(es) to uninstall instructions from. If no',
            '                       harness is provided, the one set as default in',
            '                       configuration is used.',
            '                       Available harnesses:',
            ...Harness.names.map((name) => `                       - ${name}`),
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(context: RunContext<UninstallArguments>): Promise<void> {
        if (context.parsedArguments.args.self) {
            return Promise.reject(new Error('Self-uninstallation is not implemented.'));
        }
        return runInstructionOperation('uninstall', this, context);
    }
}
