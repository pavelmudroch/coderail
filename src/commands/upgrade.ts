import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';
import { Log } from '@log';
import { join } from '@std/path';

import type { RunContext } from './helpers/command.ts';
import { activateDistribution } from './upgrade/activation.ts';
import { AssetApplyError, type AssetPlan, type AssetProgress } from './upgrade/assets.ts';
import { cleanupStaleExecutablesWithinLock, retireExecutables } from './upgrade/cleanup.ts';
import { resolveRelease, targetTriple, withStagedDistribution } from './upgrade/distribution.ts';

type UpgradeArguments = {
    help: boolean;
    version?: string;
    canary: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
};

type UpgradeOptions = {
    fetcher?: typeof fetch;
    runningExecutable?: string;
    interactive?: boolean;
    confirm?: (message: string) => boolean | Promise<boolean>;
    report?: (message: string) => void;
};

export class Upgrade implements Command<UpgradeArguments> {
    readonly requiresInit = false;

    constructor(private options: UpgradeOptions = {}) {}

    parseArguments(original: readonly string[]): ParsedArguments<UpgradeArguments> {
        const args: UpgradeArguments = {
            help: false,
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
            for (const option of ['--help', '--canary', '--force', '--yes', '--no']) {
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
            '',
            '  Install or reconcile a verified Coderail distribution, including the current',
            '  version.',
            '',
            'Options:',
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
        const report = this.options.report ?? Log.info;
        const root = context.context.installRoot;
        const output = this.options.report ?? Log.output;
        const warn = this.options.report ?? Log.warn;
        const reportError = this.options.report ?? Log.error;
        const confirm = this.options.confirm ?? Log.confirm;
        let assetPlan: AssetPlan | undefined;
        let progress: AssetProgress | undefined;
        let activated = false;
        const signal = context.signal;
        const list = (paths: string[]): string =>
            paths.map((path) => `"${join(root, path)}"`).join(', ') || 'none';
        const reportProgress = (plan: AssetPlan): void => {
            report(
                `Completed writes: ${progress ? list(progress.written) : 'unknown'}; removals: ${
                    progress ? list(progress.removed) : 'unknown'
                }; manifest saved: ${
                    progress?.manifestSaved ?? 'unknown; inspect the distribution manifest'
                }.`,
            );
            report(
                `Skipped (kept): ${list(
                    plan.actions
                        .filter((action) => !action.approved)
                        .map((action) => action.file.path),
                )}.`,
            );
        };
        const fetcher: typeof fetch = (input, init) => {
            signal.throwIfAborted();
            return (this.options.fetcher ?? fetch)(input, { ...init, signal });
        };
        try {
            signal.throwIfAborted();
            const release = await resolveRelease(
                args,
                targetTriple(Deno.build.os, Deno.build.arch),
                fetcher,
            );
            report(`Selected ${release.version} (${release.commit}) for ${release.target}.`);
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
                            const approved = await confirm(
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
                                    warn(`Residual executable ${path}: ${String(error)}`),
                            });
                            // Cleanup saved a newer manifest. Do not resurrect its removed ownership records.
                            plan.manifest.files = plan.manifest.files.filter(
                                (file) => !removed.includes(join(lockedRoot, file.path)),
                            );
                            for (const path of removed) {
                                report(`Removed stale executable ${path}.`);
                            }
                            for (const action of plan.actions) {
                                if (!action.approved) {
                                    report(
                                        `Declined ${action.kind}: "${join(root, action.file.path)}".`,
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
                    output(
                        `Assets reconciled and manifest saved. Activated ${activation.selectedExecutable}.`,
                    );
                    await retireExecutables(root, activation, {
                        runningExecutable: this.options.runningExecutable,
                        report: (path, error) =>
                            warn(`Residual executable ${path}: ${String(error)}`),
                    });
                },
                fetcher,
            );
        } catch (error) {
            if (assetPlan) {
                if (error instanceof AssetApplyError) {
                    progress = error.progress;
                }
                reportProgress(assetPlan);
                reportError(
                    `Upgrade partially changed installation "${root}": ${String(
                        error,
                    )}. Activation ${activated ? 'completed' : 'did not complete'}.`,
                );
                reportError(
                    `Preserve user templates first: removing "${root}" also removes user templates. Manually remove this root and rebootstrap using curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh -o install.sh, then run install.sh selecting "${root}".`,
                );
            } else {
                reportError(
                    `Upgrade preflight failed for installation "${root}"; installed files were not changed: ${String(
                        error,
                    )}`,
                );
            }
            throw error;
        }
    }
}
