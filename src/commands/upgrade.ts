import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';
import {
    activateDistribution,
    ActivationError,
    AssetApplyError,
    type AssetPlan,
    type AssetProgress,
    cleanupStaleExecutablesWithinLock,
    listStableReleases,
    resolveRelease,
    retireExecutables,
    setupPath,
    targetTriple,
    terminalConfirm,
    withStagedDistribution,
} from '@installation';
import { Log } from '@log';
import { join } from '@std/path';

import type { RunContext } from './helpers/command.ts';

type UpgradeArguments = {
    help: boolean;
    list: boolean;
    version?: string;
    canary: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
};

type UpgradeOptions = {
    fetcher?: typeof fetch;
    currentVersion?: string;
    runningExecutable?: string;
    interactive?: boolean;
    pathSetup?: typeof setupPath;
};

export class Upgrade implements Command<UpgradeArguments> {
    readonly requiresInit = false;

    constructor(private options: UpgradeOptions = {}) {}

    parseArguments(original: readonly string[]): ParsedArguments<UpgradeArguments> {
        const args: UpgradeArguments = {
            help: false,
            list: false,
            canary: false,
            force: false,
            yes: false,
            no: false,
        };
        for (let i = 0; i < original.length; i++) {
            const arg = original[i];
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg === undefined) {
                continue;
            }
            for (const option of ['--help', '--list', '--canary', '--force', '--yes', '--no']) {
                if (arg.startsWith(`${option}=`)) {
                    Cli.raiseUsageError(`Option "${option}" does not take a value.`, this);
                }
            }
            if (arg === '--version' || arg.startsWith('--version=')) {
                const value = arg.startsWith('--version=')
                    ? arg.slice('--version='.length)
                    : original[++i];
                if (!value || value.startsWith('-')) {
                    Cli.raiseUsageError('Option "--version" requires a value.', this);
                }
                if (!/^(latest|v?(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,2})$/.test(value)) {
                    Cli.raiseUsageError(
                        'Option "--version" must be latest, X, X.Y or X.Y.Z (optional v prefix).',
                        this,
                    );
                }
                args.version = value;
                continue;
            }
            switch (arg) {
                case '--list':
                    args.list = true;
                    break;
                case '--canary':
                    args.canary = true;
                    break;
                case '-f':
                case '--force':
                    args.force = true;
                    break;
                case '-y':
                case '--yes':
                    args.yes = true;
                    break;
                case '-n':
                case '--no':
                    args.no = true;
                    break;
                default:
                    if (arg.startsWith('-')) {
                        Cli.raiseUsageError(`Unknown option "${arg}".`, this);
                    }
                    Cli.raiseUsageError(`Unexpected upgrade argument "${arg}".`, this);
            }
        }
        if (
            args.list &&
            (args.version !== undefined || args.canary || args.force || args.yes || args.no)
        ) {
            Cli.raiseUsageError('Option "--list" cannot be combined with upgrade options.', this);
        }
        if (args.canary && args.version !== undefined) {
            Cli.raiseUsageError(
                'Options "--canary" and "--version" cannot be used together.',
                this,
            );
        }
        if (args.yes && args.no) {
            Cli.raiseUsageError('Options "--yes" and "--no" cannot be used together.', this);
        }
        if ((args.yes || args.no) && !args.force) {
            Cli.raiseUsageError('Options "--yes" and "--no" require "--force".', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsed: ParsedArguments<UpgradeArguments>): boolean {
        return parsed.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr upgrade [--help] [--canary | --version <version>] [--force [--yes | --no]]',
            '  cr upgrade [--help] --list',
            '',
            '  Install or reconcile a verified Coderail distribution, including the current',
            '  version.',
            '',
            'Options:',
            '      --list           List stable releases without changing the installation;',
            '                       cannot be combined with other upgrade options.',
            '  -h, --help           Show this help message and exit.',
            '      --version <version>',
            '                       Select latest (default), X / vX, X.Y / vX.Y, or',
            '                       X.Y.Z / vX.Y.Z.',
            '                       Latest selects GitHub’s designated stable release.',
            '                       Partial versions select the newest matching stable',
            '                       release.',
            '                       Exact versions permit downgrades.',
            '      --canary         Select the latest unreleased build; excludes --version.',
            '  -f, --force          Allow conflicting writes/removals with per-file',
            '                       confirmation.',
            '  -y, --yes            Approve conflicts automatically (requires --force).',
            '  -n, --no             Decline conflicts automatically (requires --force).',
            '',
            '  Unchanged managed files are updated without prompts; user templates are',
            '  preserved.',
            '  Conflicts fail before changes without --force. Noninteractive conflicts also',
            '  need --yes or --no. These answers are mutually exclusive; declined files stay',
            '  unchanged.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<UpgradeArguments>): Promise<void> {
        const args = context.parsedArguments.args;
        if (args.help) {
            return;
        }
        const root = context.context.installRoot;
        let assetPlan: AssetPlan | undefined;
        let progress: AssetProgress | undefined;
        let activated = false;
        const signal = context.signal;
        const reportProgress = (plan: AssetPlan): void => {
            if (progress !== undefined) {
                Log.info(`Completed writes (${progress.written.length})`);
                for (const path of progress.written) {
                    Log.notice(`"${join(root, path)}"`);
                }

                Log.info(`Completed removals (${progress.removed.length})`);
                for (const path of progress.removed) {
                    Log.notice(`"${join(root, path)}"`);
                }

                Log.info(`Manifest saved: ${progress.manifestSaved ? 'yes' : 'no'}`);
            } else {
                Log.info('Completed writes: unknown');
                Log.info('Completed removals: unknown');
                Log.info('Manifest saved: unknown; inspect the distribution manifest');
            }

            const skipped = plan.actions
                .filter((action) => !action.approved)
                .map((action) => action.file.path);
            Log.info(`Skipped (${skipped.length})`);
            for (const path of skipped) {
                Log.notice(`"${join(root, path)}"`);
            }
        };
        const fetcher: typeof fetch = (input, init) => {
            signal.throwIfAborted();
            return (this.options.fetcher ?? fetch)(input, { ...init, signal });
        };
        try {
            signal.throwIfAborted();
            if (args.list) {
                const { versions, latest } = await listStableReleases(fetcher);
                const formattedVersionOutputs: string[] = [];
                for (const version of versions) {
                    const isLatest = version === latest;
                    const isCurrent = version === (this.options.currentVersion ?? Cli.version);
                    const markers: string[] = [];
                    if (isLatest) {
                        markers.push('latest');
                    }
                    if (isCurrent) {
                        markers.push('current');
                    }

                    const outputLine = `${version}${markers.length ? ` (${markers.join(', ')})` : ''}`;
                    if (isCurrent) {
                        formattedVersionOutputs.push(Log.color.green(outputLine));
                        continue;
                    }
                    if (isLatest) {
                        formattedVersionOutputs.push(Log.color.yellow(outputLine));
                        continue;
                    }
                    formattedVersionOutputs.push(outputLine);
                }
                Log.output(formattedVersionOutputs.join('\n'));
                return;
            }
            const release = await resolveRelease(
                args,
                targetTriple(Deno.build.os, Deno.build.arch),
                fetcher,
            );
            Log.info(`Selected ${release.version} (${release.commit}) for ${release.target}.`);
            await withStagedDistribution(
                release,
                async (stage) => {
                    signal.throwIfAborted();
                    const activation = await activateDistribution(root, stage, {
                        ...args,
                        runningExecutable: this.options.runningExecutable,
                        interactive:
                            this.options.interactive ??
                            (!Log.nonInteractive && Deno.stdin.isTerminal()),
                        confirm: async (action) => {
                            signal.throwIfAborted();
                            const approved = await Log.confirm(
                                `${action.kind === 'write' ? 'Overwrite' : 'Remove'} "${join(
                                    root,
                                    action.file.path,
                                )}"?`,
                            );
                            signal.throwIfAborted();
                            return approved;
                        },
                        beforeMutation: async (lockedRoot, plan) => {
                            signal.throwIfAborted();
                            assetPlan = plan;
                            const removed = await cleanupStaleExecutablesWithinLock(lockedRoot, {
                                runningExecutable: this.options.runningExecutable,
                                report: (path, error) =>
                                    Log.warn(`Residual executable ${path}: ${String(error)}`),
                            });
                            // Cleanup saved a newer manifest. Do not resurrect its removed ownership records.
                            plan.manifest.files = plan.manifest.files.filter(
                                (file) => !removed.includes(join(lockedRoot, file.path)),
                            );
                            for (const path of removed) {
                                Log.info(`Removed stale executable ${path}.`);
                            }
                            for (const action of plan.actions) {
                                if (!action.approved) {
                                    Log.info(
                                        `Declined ${action.kind}: "${join(
                                            root,
                                            action.file.path,
                                        )}".`,
                                    );
                                }
                            }
                        },
                    });
                    activated = true;
                    if (assetPlan) {
                        progress = {
                            written: assetPlan.actions
                                .filter((action) => action.approved && action.kind === 'write')
                                .map((action) => action.file.path),
                            removed: assetPlan.actions
                                .filter((action) => action.approved && action.kind === 'remove')
                                .map((action) => action.file.path),
                            manifestSaved: true,
                        };
                        reportProgress(assetPlan);
                    }
                    Log.output(
                        `Assets reconciled and manifest saved. Activated ${activation.selectedExecutable}.`,
                    );
                    await retireExecutables(root, activation, {
                        runningExecutable: this.options.runningExecutable,
                        report: (path, error) =>
                            Log.warn(`Residual executable ${path}: ${String(error)}`),
                    });
                },
                fetcher,
            );
            try {
                await (this.options.pathSetup ?? setupPath)({
                    bin: join(root, 'bin'),
                    confirm: context.configuration.nonInteractive
                        ? undefined
                        : () => terminalConfirm(`Add "${join(root, 'bin')}" to your PATH?`),
                    report: Log.warn,
                });
            } catch (error) {
                Log.warn(
                    `Could not configure PATH: ${String(error)}. Add "${join(
                        root,
                        'bin',
                    )}" to your PATH manually and open a new shell.`,
                );
            }
        } catch (error) {
            if (assetPlan) {
                if (error instanceof AssetApplyError || error instanceof ActivationError) {
                    progress = error.progress;
                }
                reportProgress(assetPlan);
                Log.error(
                    `Upgrade partially changed installation "${root}": ${String(
                        error,
                    )}. Activation ${activated ? 'completed' : 'did not complete'}.`,
                );
                Log.error(
                    `Preserve user templates first: removing "${root}" also removes user templates. Manually remove this root and rebootstrap using curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh -o install.sh, then run install.sh selecting "${root}".`,
                );
            } else {
                Log.error(
                    `Upgrade preflight failed for installation "${root}"; installed files were not changed: ${String(
                        error,
                    )}`,
                );
            }
            throw error;
        }
    }
}
