import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';

export class Doctor implements Command {
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
            '  cr doctor [--help] [--repair]',
            '',
            '  Run system diagnostics and checks, providing information about coderail setup,',
            '  environment, and optional steps for repair. Allows automatic remediation where',
            '  possible.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '      --repair         Attempt automatic remediation of detected issues.',
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
