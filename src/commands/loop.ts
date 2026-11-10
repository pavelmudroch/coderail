import { Cli } from '@cli';
import type { Command, ParsedArguments, RunContext } from '@commands';
import { Harness } from '@harness';

import { type LoopOptions, resolveStageSettings } from './loop/resolve-stage-settings.ts';
import { runLoop } from './loop/run-loop.ts';

type LoopArguments = {
    help: boolean;
    autoReview: boolean;
    autoCommit: boolean;
    harness?: string;
    limit?: number;
    options: LoopOptions;
};

export class Loop implements Command<LoopArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<LoopArguments> {
        const args: LoopArguments = {
            help: false,
            autoReview: false,
            autoCommit: false,
            options: {},
        };
        const rest: string[] = [];
        for (let i = 0; i < originalArgs.length; i++) {
            const arg = originalArgs[i];
            if (arg === undefined) {
                continue;
            }
            if (arg === '-h' || arg === '--help') {
                return { args: { ...args, help: true }, rest };
            }
            if (arg === '--auto-review' || arg === '--auto-commit' || /^-[rc]+$/.test(arg)) {
                args.autoReview ||=
                    arg === '--auto-review' ||
                    (arg.startsWith('-') && !arg.startsWith('--') && arg.includes('r'));
                args.autoCommit ||=
                    arg === '--auto-commit' ||
                    (arg.startsWith('-') && !arg.startsWith('--') && arg.includes('c'));
                continue;
            }
            if (arg === '--') {
                rest.push(...originalArgs.slice(i + 1));
                break;
            }
            if (arg === '-l' || arg === '--limit' || arg.startsWith('--limit=')) {
                const value = arg.startsWith('--limit=') ? arg.slice(8) : originalArgs[++i];
                if (
                    !value ||
                    !/^\d+$/.test(value) ||
                    !Number.isSafeInteger(Number(value)) ||
                    Number(value) < 1
                ) {
                    Cli.raiseUsageError('Limit must be a positive integer.', this);
                }
                args.limit = Number(value);
                continue;
            }
            if (arg === '-o' || arg === '--options' || arg.startsWith('--options=')) {
                const value = arg.startsWith('--options=') ? arg.slice(10) : originalArgs[++i];
                if (!value) {
                    Cli.raiseUsageError('Option "--options" requires a value.', this);
                }
                for (const entry of value.split(',')) {
                    const parts = entry.split('=');
                    const key = parts[0];
                    const nativeValue = parts[1];
                    if (
                        parts.length !== 2 ||
                        !key ||
                        !nativeValue?.trim() ||
                        ![
                            'model',
                            'effort',
                            'implement-model',
                            'implement-effort',
                            'review-model',
                            'review-effort',
                            'commit-model',
                            'commit-effort',
                        ].includes(key)
                    ) {
                        Cli.raiseUsageError(`Invalid loop setting "${entry}".`, this);
                    }
                    args.options[key as keyof LoopOptions] = nativeValue;
                }
                continue;
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            if (args.harness === undefined) {
                args.harness = arg;
            } else {
                rest.push(arg);
            }
        }
        if (rest.length) {
            Cli.raiseUsageError(`Unexpected arguments: ${rest.join(' ')}`, this);
        }
        return { args, rest };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<LoopArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        return [
            'Usage:',
            '  cr loop [<harness>] [-l <n>] [-r] [-c] [-o <settings>] [--help]',
            '',
            '  Implement ready tickets in fresh sessions and stage each successful attempt.',
            '  Requires an initialized, clean project in Git. Uses defaultHarness when omitted.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -l, --limit <n>      Positive implementation attempt limit (default: unlimited).',
            '  -r, --auto-review   Review before staging using a manually supplied review skill.',
            '  -c, --auto-commit   Commit staged work using the commit skill (combine as -rc).',
            '  -o, --options <settings>',
            '                       Comma-separated key=value native settings:',
            '                       model, effort, implement-model, implement-effort,',
            '                       review-model, review-effort, commit-model, commit-effort.',
            '',
            '  Review records urgent tasks on the reopened original or deferred follow-up tickets.',
            '  It reviews unstaged/untracked project work, preserving the index. Selection resumes',
            '  after staging and optional commit; review/commit do not count toward the attempt limit.',
            '  Staging is unconditional. Commit skips empty diffs and requires new commits and a clean',
            '  project. Auto-commit rejects outside staged changes at startup; outside dirty work is allowed.',
            '  All enabled settings are preflighted. Failures/Ctrl+C preserve work and commits; no retry or push.',
            '  Logs share the ticket file; completion summaries include durations and unfinished work.',
        ].join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<LoopArguments>): Promise<void> {
        const {
            harness = context.configuration.defaultHarness,
            limit,
            autoReview,
            autoCommit,
            options,
        } = context.parsedArguments.args;
        if (harness !== 'codex' && harness !== 'claude') {
            Cli.raiseUsageError(
                harness
                    ? `Unknown harness "${harness}".`
                    : 'Specify a harness or configure defaultHarness.',
                this,
            );
        }
        const projectRoot = context.context.repositoryRoot;
        if (!projectRoot) {
            throw new Error('No initialized project found. Run "cr init" first.');
        }
        using connector = Harness.get(harness, { scope: 'local', projectRoot });
        if (!connector) {
            throw new Error(`Harness "${harness}" is unavailable.`);
        }
        await runLoop({
            projectRoot,
            connector,
            settings: resolveStageSettings(
                harness,
                'implement',
                context.configuration.loop,
                options,
            ),
            reviewSettings: autoReview
                ? resolveStageSettings(harness, 'review', context.configuration.loop, options)
                : undefined,
            commitSettings: autoCommit
                ? resolveStageSettings(harness, 'commit', context.configuration.loop, options)
                : undefined,
            signal: context.signal,
            limit,
        });
    }
}
