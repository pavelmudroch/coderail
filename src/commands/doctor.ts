import { Cli } from '@cli';
import type { Command, GlobalArguments, ParsedArguments } from '@commands';
import { Log } from '@log';

import { Installation } from './doctor/installation.ts';
import type { RunContext } from './helpers/command.ts';

export type BootstrapRunContext = {
    parsedArguments: ParsedArguments;
    globalArguments: GlobalArguments;
    signal: AbortSignal;
};

export class Doctor implements Command {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments {
        const args = { help: false, repair: false };
        for (const arg of originalArgs) {
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                break;
            }
            if (arg === '--repair') {
                args.repair = true;
                continue;
            }
            Cli.raiseUsageError(`Unexpected argument "${arg}".`, this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments): boolean {
        return parsedArguments.args.help === true;
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

    async run(input: BootstrapRunContext | RunContext): Promise<void> {
        input.signal.throwIfAborted();
        if (input.parsedArguments.args.repair) {
            throw new Error('not implemented');
        }
        const report = await Installation.check(input.signal);
        input.signal.throwIfAborted();
        for (const failure of report.failures) {
            Log.output(`Failure: ${failure.message}${failure.repairable ? ' [repairable]' : ''}`);
            for (const option of failure.manualRepair) {
                Log.output(`  Manual repair: ${option}`);
            }
        }
        for (const skipped of report.skipped) {
            Log.output(`Skipped: ${skipped}`);
        }
        if (report.failures.length === 0) {
            Log.output('Installation checks passed.');
        }
        Deno.exitCode = report.failures.length ? 1 : 0;
    }
}
