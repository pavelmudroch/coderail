import { Cli } from '@cli';
import type { Command, GlobalArguments, ParsedArguments } from '@commands';
import { Conf } from '@conf';
import { Log } from '@log';
import { dirname, fromFileUrl, relative, resolve } from '@std/path';

import { Installation } from './doctor/installation.ts';
import { Project } from './doctor/project.ts';
import { runRepairs } from './doctor/repairs.ts';
import type { DoctorReport } from './doctor/types.ts';
import type { RunContext } from './helpers/command.ts';

export type BootstrapRunContext = {
    parsedArguments: ParsedArguments;
    globalArguments: GlobalArguments;
    signal: AbortSignal;
};

function configurationErrorDetails(error: unknown): string[] {
    if (Array.isArray(error)) {
        return error.flatMap(configurationErrorDetails);
    }
    if (error instanceof Error) {
        return [
            error.message,
            ...(error.cause === undefined ? [] : configurationErrorDetails(error.cause)),
        ];
    }
    return [String(error)];
}

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
        const bootstrap = Conf.createConfiguration(global);
        Log.level = bootstrap.logLevel;
        Log.noColor = bootstrap.noColor;
        Log.nonInteractive = bootstrap.nonInteractive;
        const cwd = resolve(Deno.cwd(), global.cwd ?? '.');
        const collect = async (): Promise<DoctorReport> => {
            Log.level = bootstrap.logLevel;
            Log.noColor = bootstrap.noColor;
            Log.nonInteractive = bootstrap.nonInteractive;
            Log.notice(`Checking installation before project diagnostics (cwd "${cwd}").`);
            const report = await Installation.check(input.signal);
            input.signal.throwIfAborted();
            Log.notice('Resolving installation and configuration paths.');
            let installRoot: string | undefined;
            try {
                const entry = Deno.build.standalone
                    ? Deno.execPath()
                    : fromFileUrl(Deno.mainModule);
                Log.notice(`Resolving configuration installation root from "${entry}".`);
                installRoot = dirname(dirname(await Deno.realPath(entry)));
                Log.notice(
                    `Using installation root "${installRoot}" for configuration diagnostics.`,
                );
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
            Log.notice(`Discovering project from cwd "${cwd}".`);
            const discovery = await Project.discover(cwd, input.signal);
            report.failures.push(...discovery.failures);
            report.skipped.push(...discovery.skipped);
            if (discovery.repositoryRoot !== undefined) {
                repositoryRoots.push(discovery.repositoryRoot);
                Log.notice(`Checking project "${discovery.repositoryRoot}".`);
                const project = await Project.check(discovery.repositoryRoot, input.signal);
                report.failures.push(...project.failures);
                report.skipped.push(...project.skipped);
            }
            Log.notice(`Diagnosing configuration for cwd "${cwd}".`);
            const { configuration, errors } = await Conf.diagnoseConfiguration(
                { installRoot, repositoryRoots, validationRoots },
                global,
                input.signal,
            );
            for (const { source, path, error } of errors) {
                report.failures.push({
                    message: 'Invalid configuration',
                    details: [
                        { label: 'Source', value: source },
                        ...(path === undefined
                            ? []
                            : [
                                  {
                                      label: 'File',
                                      value:
                                          source === 'Project configuration' &&
                                          discovery.repositoryRoot !== undefined
                                              ? relative(discovery.repositoryRoot, path)
                                              : path,
                                  },
                              ]),
                        ...configurationErrorDetails(error).map((value) => ({
                            label: 'Error',
                            value,
                        })),
                    ],
                    repairable: false,
                    manualRepair: [
                        'Correct the configuration source or environment override and rerun "cr doctor".',
                    ],
                });
            }
            Log.level = configuration.logLevel;
            Log.noColor = configuration.noColor;
            Log.nonInteractive = configuration.nonInteractive;
            Log.notice(
                `Checking configured harness executable (${configuration.defaultHarness ?? 'no harness configured'}).`,
            );
            const executable = await Project.checkExecutable(
                configuration.defaultHarness,
                input.signal,
            );
            report.failures.push(...executable.failures);
            report.skipped.push(...executable.skipped);
            input.signal.throwIfAborted();
            return report;
        };
        let report = await collect();
        const actions = new Map(
            report.failures.flatMap((failure) =>
                failure.repair ? [[failure.repair.key, failure.repair] as const] : [],
            ),
        );
        const blocks: string[] = [];
        if (input.parsedArguments.args.repair) {
            const results = await runRepairs([...actions.values()], input.signal);
            report = await collect();
            const unresolved = new Set(
                report.failures.map((failure) => failure.repairKey ?? failure.repair?.key),
            );
            const outcomes = results.map((result) => {
                const label =
                    result.error !== undefined || unresolved.has(result.key)
                        ? Log.color.red('Unresolved:')
                        : Log.color.green('Repaired:');
                const heading = `${label} ${result.description}`;
                return result.error === undefined
                    ? heading
                    : `${heading}\n  Repair error: ${result.error.replaceAll('\n', '\n    ')}`;
            });
            if (outcomes.length) {
                blocks.push(outcomes.join('\n'));
            }
        }
        for (const failure of report.failures) {
            const marker = failure.repair ? ` ${Log.color.green('[repairable]')}` : '';
            blocks.push(
                [
                    `${Log.color.red('Failure:')} ${failure.message}${marker}`,
                    ...(failure.details ?? []).map(
                        ({ label, value }) => `  ${label}: ${value.replaceAll('\n', '\n    ')}`,
                    ),
                    ...failure.manualRepair.map(
                        (option) => `  ${Log.color.yellow('Manual fix:')} ${option}`,
                    ),
                ].join('\n'),
            );
        }
        const summary: string[] = [];
        if (report.failures.some((failure) => failure.repair !== undefined)) {
            summary.push('Automatic fix: cr doctor --repair');
        }
        for (const skipped of report.skipped) {
            summary.push(
                typeof skipped === 'string'
                    ? `Skipped: ${skipped}`
                    : `Skipped in ${skipped.reason}: ${skipped.checks.join(', ')}`,
            );
        }
        if (report.failures.length === 0) {
            summary.push('Doctor checks passed.');
        }
        if (summary.length) {
            blocks.push(summary.join('\n'));
        }
        Log.output(blocks.join('\n\n'));
        Deno.exitCode = report.failures.length ? 1 : 0;
    }
}
