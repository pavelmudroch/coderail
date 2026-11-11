import { Cli } from '@cli';
import type { Command, GlobalArguments, ParsedArguments } from '@commands';
import { Conf } from '@conf';
import { Log } from '@log';
import { dirname, fromFileUrl, resolve } from '@std/path';

import { Installation } from './doctor/installation.ts';
import { Project } from './doctor/project.ts';
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
        const global: GlobalArguments =
            'globalArguments' in input
                ? input.globalArguments
                : {
                      cwd: input.context.currentWorkingDirectory,
                      help: false,
                      version: false,
                      verbose: input.configuration.logLevel === 'verbose',
                      quiet: input.configuration.logLevel === 'quiet',
                      noColor: input.configuration.noColor,
                      nonInteractive: input.configuration.nonInteractive,
                  };
        const report = await Installation.check(input.signal);
        input.signal.throwIfAborted();
        let installRoot: string | undefined;
        try {
            const entry = Deno.build.standalone ? Deno.execPath() : fromFileUrl(Deno.mainModule);
            installRoot = dirname(dirname(await Deno.realPath(entry)));
        } catch {
            input.signal.throwIfAborted();
            report.skipped.push(
                'Global and source repository configuration: installation paths unavailable.',
            );
        }
        const repositoryRoots: string[] = [];
        const validationRoots: string[] = [];
        if (!Deno.build.standalone && installRoot !== undefined) {
            validationRoots.push(installRoot);
        }
        const cwd = resolve(Deno.cwd(), global.cwd ?? '.');
        const discovery = await Project.discover(cwd, input.signal);
        report.failures.push(...discovery.failures);
        report.skipped.push(...discovery.skipped);
        if (discovery.repositoryRoot !== undefined) {
            repositoryRoots.push(discovery.repositoryRoot);
            const project = await Project.check(discovery.repositoryRoot, input.signal);
            report.failures.push(...project.failures);
            report.skipped.push(...project.skipped);
        }
        const { configuration, errors } = await Conf.diagnoseConfiguration(
            { installRoot, repositoryRoots, validationRoots },
            global,
            input.signal,
        );
        for (const error of errors) {
            report.failures.push({
                message: error.message,
                repairable: false,
                manualRepair: [
                    'Correct the configuration source or environment override and rerun "cr doctor".',
                ],
            });
        }
        Log.level = configuration.logLevel;
        Log.noColor = configuration.noColor;
        Log.nonInteractive = configuration.nonInteractive;
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
            Log.output('Doctor checks passed.');
        }
        Deno.exitCode = report.failures.length ? 1 : 0;
    }
}
