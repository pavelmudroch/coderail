import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';
import { Log } from '@log';
import { resolve } from '@std/path';

import { ProjectInitialization } from '../project-initialization.ts';
import type { RunContext } from './helpers/command.ts';

type InitArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
    dry: boolean;
    dryPath: string | undefined;
    templates: string[];
};

export class Init implements Command<InitArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<InitArguments> {
        const args: InitArguments = {
            help: false,
            force: false,
            yes: false,
            no: false,
            dry: false,
            dryPath: undefined,
            templates: [],
        };
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
                args.templates.push(...originalArgs.slice(i + 1));
                break;
            }
            if (arg === '--dry') {
                args.dry = true;
                const next = originalArgs[i + 1];
                if (next !== undefined && !next.startsWith('-')) {
                    args.dryPath = next;
                    i++;
                }
                continue;
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
            if (arg === '-n' || arg === '--no') {
                args.no = true;
                continue;
            }
            if (arg.startsWith('--no=')) {
                Cli.raiseUsageError('Option "--no" does not take a value.', this);
            }
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.templates.push(arg);
        }
        if (args.yes && args.no) {
            Cli.raiseUsageError('Options "--yes" and "--no" cannot be used together.', this);
        }
        if ((args.yes || args.no) && !args.force) {
            Cli.raiseUsageError('Options "--yes" and "--no" require "--force".', this);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<InitArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr init [--help] [--force [--yes | --no]] [<template> ...] [--dry [<directory>]]',
            '',
            '  The initialization command sets up the necessary configuration for Coderail.',
            '  Optionally allows installation of templates during initialization.',
            '',
            'Options:',
            '      --dry [<directory>] Preview without writes, or apply into the directory.',
            '  -h, --help           Show this help message and exit.',
            '  -f, --force          Prompt before overwriting differing template files.',
            '  -y, --yes            Automatically accept overwrites; requires --force.',
            '  -n, --no             Automatically skip conflicts; requires --force.',
            '',
            'Examples:',
            '  cr init my-template --dry             Preview known file/config changes and startup selection.',
            '  cr init my-template --dry ./preview   Apply and run startup in ./preview.',
            '  Preview never runs scripts or predicts their effects; conflicts cause failure.',
            '',
            'Arguments:',
            '  <template>           The template(s) to use for initialization.',
        ];
        return usageLines.join('\n');
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    async run({
        context: context,
        parsedArguments,
        configuration,
        signal,
    }: RunContext<InitArguments>): Promise<void> {
        using spinner = Log.spinner('Initializing project...');
        const args = parsedArguments.args;
        const projectRoot =
            args.dryPath === undefined
                ? context.currentWorkingDirectory
                : resolve(context.currentWorkingDirectory, args.dryPath);
        const preview = args.dry && args.dryPath === undefined;
        const report = await ProjectInitialization.initialize({
            projectRoot,
            installRoot: context.installRoot,
            names: parsedArguments.args.templates,
            mode: preview ? 'preview' : 'apply',
            overwrite: args.force
                ? (path) => {
                      if (args.yes || args.no) {
                          return Promise.resolve(args.yes);
                      }
                      if (configuration.nonInteractive || !Deno.stdin.isTerminal()) {
                          throw new Error(
                              'Template overwrite requires confirmation. Use --force --yes or --force --no in noninteractive mode.',
                          );
                      }
                      return Promise.resolve(Log.confirm(`Overwrite template asset "${path}"?`));
                  }
                : 'error',
            signal,
        });
        for (const action of report.actions) {
            spinner.addStep(`${action.kind}: ${action.path}`);
            Log.output(`${action.kind}: ${action.path}`);
        }
        if (report.conflicts.length > 0) {
            throw new Error(`Initialization preview found ${report.conflicts.length} conflict(s).`);
        }
        Log.output(
            preview
                ? `Initialization preview for "${projectRoot}" complete. Startup effects are not simulated.`
                : `Current working directory "${projectRoot}" initialized.`,
        );
    }
}
