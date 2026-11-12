import { Cli } from '@cli';
import type { Command, ParsedArguments } from '@commands';
import { Fs } from '@fs';
import { Log } from '@log';
import { join } from '@std/path';

import { ProjectInitialization } from '../project-initialization.ts';
import type { RunContext } from './helpers/command.ts';

type InitArguments = {
    help: boolean;
    templates: string[];
};

export class Init implements Command<InitArguments> {
    readonly requiresInit = false;

    parseArguments(originalArgs: readonly string[]): ParsedArguments<InitArguments> {
        const args: InitArguments = { help: false, templates: [] };
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
            if (arg.startsWith('-')) {
                Cli.raiseUsageError(`Unknown option "${arg}".`, this);
            }
            args.templates.push(arg);
        }
        return { args, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments<InitArguments>): boolean {
        return parsedArguments.args.help;
    }

    getUsage(): string {
        const usageLines = [
            'Usage:',
            '  cr init [--help] [<template> ...]',
            '',
            '  The initialization command sets up the necessary configuration for Coderail.',
            '  Optionally allows installation of templates during initialization.',
            '',
            'Options:',
            '  -h, --help           Show this help message and exit.',
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
        signal,
    }: RunContext<InitArguments>): Promise<void> {
        Log.notice(`Ensuring directory ".coderail" exists.`);
        const directoryPath = join(context.currentWorkingDirectory, '.coderail');
        await Fs.makeDirectory(directoryPath);

        using spinner = Log.spinner('Creating base structure...');
        await ProjectInitialization.ensureConfig(context.currentWorkingDirectory, signal);
        await ProjectInitialization.ensureIgnoreRules(context.currentWorkingDirectory, signal);
        spinner.setMessage('Installing templates...');
        for (const template of parsedArguments.args.templates) {
            spinner.addStep(`template "${template}".`);
            await installTemplate(template);
        }
        Log.output(`Current working directory "${context.currentWorkingDirectory}" initialized.`);
    }
}

async function installTemplate(template: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate async template installation
    Log.notice(`Template "${template}" installed.`);
}
