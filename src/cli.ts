import { UsageError } from './cli/usage-error.ts';
import type { Command } from '@commands';
import { CODERAIL_VERSION } from './cli/version.ts';

export interface Cli {
    /**
     * Current version of the CLI.
     */
    readonly version: string;
    /**
     * Determines if the provided error is a usage error.
     * @param error The error to check.
     * @returns True if the error is a usage error, false otherwise.
     */
    isUsageError(error: unknown): error is UsageError;
    /**
     * Raises a usage error with the provided message and command context.
     * @param message The error message to display.
     * @param command The command context in which the error occurred.
     * @throws UsageError Always throws a UsageError.
     */
    raiseUsageError(message: string, command: Command): never;
}

export const Cli: Cli = {
    version: CODERAIL_VERSION,
    isUsageError: (error) => error instanceof UsageError,
    raiseUsageError: (message: string, command: Command): never => {
        throw new UsageError(message, { usage: command.getUsage.bind(command) });
    },
};
