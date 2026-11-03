import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';

export class Upgrade implements Command {
    readonly requiresInit = false;

    parseArguments(_args: readonly string[]): ParsedArguments {
        return { args: {}, rest: [] };
    }

    shouldHandleHelp(_parsedArguments: ParsedArguments): boolean {
        return false;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr upgrade [--help] [--canary | --version <version>] [--force [--yes | --no]]',
            '',
            '  Upgrade the Coderail CLI to the latest or selected version.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --version <version>',
            '                       Specify the version to upgrade to. Provide a valid',
            '                       version string (vX.Y.Z, X.Y.Z, X.Y, X, latest)',
            '                       (defaults to: latest)',
            '      --canary         Upgrade to the latest unreleased changes.',
            '  -f, --force          Force installation to allow overwriting existing or',
            '                       changed instructions or templates. Requires confirmation',
            '                       prompt before',
            '                       each action.',
            '  -y, --yes            Automatically answer "yes" to all prompts.',
            '  -n, --no             Automatically answer "no" to all prompts.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(_context: RunContext): Promise<void> {
        return Promise.resolve();
    }
}
