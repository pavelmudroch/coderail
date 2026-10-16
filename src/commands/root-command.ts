import { Cli, type GlobalArguments } from '@cli';
import { type Command, type CommandArguments, getCommand } from './get-command.ts';

export const rootCommand: Command<GlobalArguments> = {
    requiresRepository: false,
    parseArguments(args): CommandArguments<GlobalArguments> {
        const { global, rest } = Cli.parseGlobalArguments(args);
        return { arguments: global, rest };
    },
    shouldHandleHelp(parsedArguments): boolean {
        return Cli.shouldHandleHelp(parsedArguments.arguments);
    },
    getUsage: Cli.getUsage,
    getSubcommand(parsedArguments): Command {
        return getCommand(parsedArguments.arguments.command);
    },
    run(): Promise<void> {
        throw new Error('Not implemented');
    },
};
