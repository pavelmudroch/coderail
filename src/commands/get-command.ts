import type { Configuration } from '@conf';
import type { RuntimeContext } from '@runtime';
import { Cli } from '@cli';
import { UsageError } from '../cli/usage-error.ts';

export type CommandArguments<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
    arguments: TArgs;
    rest: string[];
};

export interface Command<TArgs extends Record<string, unknown> = Record<string, unknown>> {
    /** Whether the command requires a repository context */
    requiresRepository: boolean;
    /**
     * Parses the command-line arguments and returns the arguments object.
     * Help requests must not require execution arguments.
     * @param args The command-line arguments to parse
     * @returns The parsed arguments object
     */
    parseArguments(args: readonly string[]): CommandArguments<TArgs>;
    /**
     * Determines whether the parsed command arguments request help.
     * @param parsedArguments The parsed command arguments.
     * @returns True if command help should be displayed.
     */
    shouldHandleHelp(parsedArguments: CommandArguments<TArgs>): boolean;
    /**
     * Returns the usage information for the command.
     * @returns The usage string.
     */
    getUsage(): string;
    /**
     * Resolves a child command from the parsed arguments.
     * @returns The child command, or undefined to execute this command.
     * @throws UsageError if a required child command is missing or unknown.
     */
    getSubcommand(parsedArguments: CommandArguments<TArgs>): Command | undefined;
    /**
     * Executes the command with the given context.
     * @param context The context object containing runtime context, configuration, parsed arguments, and abort signal.
     * @returns A promise that resolves when the command has finished executing.
     */
    run(context: {
        context: RuntimeContext;
        configuration: Configuration;
        parsedArguments: CommandArguments<TArgs>;
        signal: AbortSignal;
    }): Promise<void>;
}

export function getCommand(name: string | undefined): Command {
    if (name === undefined) {
        throw new UsageError('A command is required.', { usage: Cli.getUsage });
    }
    throw new UsageError(`Unknown command "${name}".`, { usage: Cli.getUsage });
}
