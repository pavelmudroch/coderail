import { type GlobalArguments, type ParsedArguments, parseGlobalArguments } from './cli/parse.ts';
import { getUsage, shouldHandleHelp, shouldHandleVersion } from './cli/help.ts';
import { UsageError } from './cli/usage-error.ts';

export type { GlobalArguments, ParsedArguments };

export interface Cli {
    /**
     * Parses the provided command line arguments and returns the parsed result.
     * @param args The command line arguments to parse.
     * @returns The parsed arguments.
     */
    parseGlobalArguments(args: readonly string[]): ParsedArguments;
    /**
     * Returns the usage information for the CLI.
     * @returns The usage string.
     */
    getUsage(): string;
    /**
     * Determines if the provided error is a usage error.
     * @param error The error to check.
     * @returns True if the error is a usage error, false otherwise.
     */
    isUsageError(error: unknown): error is UsageError;
    /**
     * Determines if the provided global arguments indicate that the version information should be displayed.
     * @param global The global arguments to check.
     * @returns True if the version information should be displayed, false otherwise.
     */
    shouldHandleHelp(global: GlobalArguments): boolean;
    /**
     * Determines if the provided global arguments indicate that the version information should be displayed.
     * @param global The global arguments to check.
     * @returns True if the version information should be displayed, false otherwise.
     */
    shouldHandleVersion(global: GlobalArguments): boolean;
}

export const Cli: Cli = {
    parseGlobalArguments,
    getUsage,
    isUsageError: (error) => error instanceof UsageError,
    shouldHandleHelp,
    shouldHandleVersion,
};
