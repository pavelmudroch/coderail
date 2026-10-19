import type { Command, ParsedArguments } from '@commands';
import type { RunContext } from './helpers/command.ts';
import { Fs } from '@fs';
import { join } from '@std/path';
import { Cli } from '@cli';
import { Log } from '@log';

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
            '  cr init [options] [<template> ...]',
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

    async run({ context, parsedArguments }: RunContext<InitArguments>): Promise<void> {
        Log.notice(`Ensuring directory ".coderail" exists.`);
        const directoryPath = join(context.currentWorkingDirectory, '.coderail');
        await Fs.makeDirectory(directoryPath);

        const filePath = join(directoryPath, 'coderail.conf');
        try {
            const fileInfo = await Deno.lstat(filePath);
            if (!fileInfo.isFile && !fileInfo.isSymlink) {
                throw new Error(`Expected "${filePath}" to be a file or a symlink.`);
            }
            Log.notice(`Found existing configuration file at "${filePath}".`);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
            await Fs.write(filePath, defaultConfigContent());
            Log.notice(`Created new configuration file at "${filePath}".`);
        }
        for (const template of parsedArguments.args.templates) {
            await installTemplate(template);
        }
    }
}

function defaultConfigContent(): ReadableStream<Uint8Array> {
    const configContentLines = [
        '# Coderail configuration file, lines starting with "#" are comments.',
        '# Example:',
        '# default_harness = codex',
        '',
        '# Add your verification configuration here.',
        '# Example:',
        '# [[verify]]',
        '# pattern = src/${path:**}/${file:*}.ts',
        '# commands = [',
        '#   ["command", "argument_1", "argument_2"]',
        '# ]',
    ];
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller): void {
            for (const line of configContentLines) {
                controller.enqueue(encoder.encode(line + '\n'));
            }
            controller.close();
        },
    });
}

function installTemplate(_template: string): Promise<void> {
    return Promise.resolve();
}
