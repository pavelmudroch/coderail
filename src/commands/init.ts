import { Command, ParsedArguments } from '@commands';
import { RunContext } from './helpers/command.ts';
import { Fs } from '@fs';
import { join } from '@std/path';
import { Cli } from '@cli';

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
        const directoryPath = join(context.currentWorkingDirectory, '.coderail');
        const filePath = join(directoryPath, 'coderail.conf');
        try {
            await Deno.lstat(filePath);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
            await Fs.makeDirectory(directoryPath);
            await Fs.write(
                filePath,
                new ReadableStream({
                    start(controller): void {
                        controller.close();
                    },
                }),
            );
        }
        for (const template of parsedArguments.args.templates) {
            await installTemplate(template);
        }
    }
}

function installTemplate(_template: string): Promise<void> {
    return Promise.resolve();
}
