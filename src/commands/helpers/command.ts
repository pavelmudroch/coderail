import type { RuntimeContext } from '@runtime';
import type { Configuration } from '@conf';

export type ParsedArguments<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
    args: TArgs;
    rest: string[];
};

export type RunContext<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
    context: RuntimeContext;
    configuration: Configuration;
    parsedArguments: ParsedArguments<TArgs>;
    signal: AbortSignal;
};

export interface Command<TArgs extends Record<string, unknown> = Record<string, unknown>> {
    /** Whether the command requires a initialized directory context */
    requiresInit: boolean;
    /**
     * Parses the command-line arguments and returns the arguments object.
     * Help requests must not require execution arguments.
     * @param args The command-line arguments to parse
     * @returns The parsed arguments object
     */
    parseArguments(args: readonly string[]): ParsedArguments<TArgs>;
    /**
     * Determines whether the parsed command arguments request help.
     * @param parsedArguments The parsed command arguments.
     * @returns True if command help should be displayed.
     */
    shouldHandleHelp(parsedArguments: ParsedArguments<TArgs>): boolean;
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
    getSubcommand(parsedArguments: ParsedArguments<TArgs>): Command | undefined;
    /**
     * Executes the command with the given context.
     * @param context The context object containing runtime context, configuration, parsed arguments, and abort signal.
     * @returns A promise that resolves when the command has finished executing.
     */
    run(context: RunContext<TArgs>): Promise<void>;
}
