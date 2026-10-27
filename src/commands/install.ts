import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Harness } from '@harness';
import { Cli } from '@cli';

type InstallArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    harnesses: string[];
};

export class Install implements Command<InstallArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<InstallArguments> {
        const args: InstallArguments = { help: false, force: false, yes: false, harnesses: [] };
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
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.harnesses.push(arg);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<InstallArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr install [--help] [--force] [--yes] [<harness> ...]',
            '',
            '  Install instructions for specific harness, to allow agents of that harness use',
            '  coderail tool.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -f, --force          Force installation to allow overwriting existing or',
            '                       changed instructions. Requires confirmation prompt before',
            '                       each action.',
            '  -y, --yes            Automatically answer "yes" to all prompts.',
            '',
            'Arguments:',
            '  <harness>            The harness(es) to install instructions for. If no',
            '                       harness is provided, the one set as default in',
            '                       configuration is used.',
            '                       Available harnesses:',
            `                       - ${Harness.codex.name}`,
            `                       - ${Harness.claude.name}`,
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(_context: RunContext<InstallArguments>): Promise<void> {
        return Promise.resolve();
    }
}
