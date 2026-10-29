import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Cli } from '@cli';
import { Log } from '@log';
import { compileRules } from './verify/compile-rules.ts';
import { selectFiles } from './verify/select-files.ts';
import { type FileResult, runChecks } from './verify/run-checks.ts';

type VerifyArguments = {
    help: boolean;
    short: boolean;
    changed: boolean;
    paths: string[];
};

export class Verify implements Command<VerifyArguments> {
    readonly requiresInit = true;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<VerifyArguments> {
        const args: VerifyArguments = { help: false, short: false, changed: false, paths: [] };
        for (const [index, arg] of originalArgs.entries()) {
            if (arg === undefined) continue;
            if (arg === '-h' || arg === '--help') {
                args.help = true;
                return { args, rest: [] };
            }
            if (arg === '--') {
                args.paths.push(...originalArgs.slice(index + 1));
                break;
            }
            if (arg === '-s' || arg === '--short') {
                args.short = true;
                continue;
            }
            if (arg === '--changed') {
                args.changed = true;
                continue;
            }
            for (const option of ['--help', '--short', '--changed']) {
                if (arg.startsWith(`${option}=`)) {
                    Cli.raiseUsageError(`Option "${option}" does not take a value.`, this);
                }
            }
            if (arg.startsWith('-')) Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            args.paths.push(arg);
        }
        if (!args.changed && args.paths.length === 0) {
            Cli.raiseUsageError('Specify at least one path or --changed.', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<VerifyArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr verify [--help] [--short] --changed [<path> ...]',
            '  cr verify [--help] [--short] <path> [<path> ...]',
            '',
            '  Run verifications for the specified files or directories. All paths are',
            '  deduplicated and so the commands to run, so each file is verified only once',
            '  and duplicate command results are reused for different files.',
            '',
            '  Normal output includes JSON command/status lines and full command output',
            '  on stderr. --short shows only file statuses; --quiet suppresses command',
            '  output while retaining file and command statuses.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
            '  -s, --short          Show a short output, verified file per line with status',
            '                       "ok", "fail", or "skipped" (no applicable commands).',
            '      --changed        Include all changed files retrieved with git for',
            '                       verification.',
            '',
            'Arguments:',
            '  <path>               Path to the file or directory to verify. If directory is',
            '                       provided, all files within it will be considered.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run(context: RunContext<VerifyArguments>): Promise<void> {
        const root = context.context.repositoryRoot;
        if (!root) {
            throw new Error('No initialized project found. Run "cr init" first.');
        }

        const args = context.parsedArguments.args;
        const rules = compileRules(context.configuration.verify);
        const files = await selectFiles(
            root,
            context.context.currentWorkingDirectory,
            args.paths,
            args.changed,
            context.signal,
        );
        const result = await runChecks(root, files, rules, context.signal, (file) => {
            const status = formatStatus(file.status);
            Log.output(`${file.path} ${status}`);
            if (args.short) {
                return;
            }

            for (const command of file.commands) {
                const commandStatus = formatStatus(command.status);
                Log.output(`  ${JSON.stringify(command.command)} ${commandStatus}`);
                if (command.output) {
                    Log.info(command.output);
                }
            }
        });

        if (result.executedCommands === 0) {
            Log.output('No tests found');
        }

        if (result.failedFiles > 0) {
            Deno.exitCode = 1;
        }
    }
}

function formatStatus(status: FileResult['status']): string {
    switch (status) {
        case 'ok':
            return Log.color.green(status);
        case 'fail':
            return Log.color.red(status);
        case 'skipped':
            return Log.color.yellow(status);
        // deno-coverage-ignore-start
        default: {
            const exhaustiveCheck: never = status;
            return exhaustiveCheck;
        }
            // deno-coverage-ignore-stop
    }
}
