import { type Command, getCommand } from './commands/get-command.ts';
import { run } from './commands/run.ts';

export type { Command };
export interface Commands {
    /**
     * Retrieves the command associated with the given name.
     * @param name The name of the command to retrieve.
     * @returns The command associated with the given name.
     */
    getCommand(name: string | undefined): Command;
    /** Parses the command tree and executes the selected command. */
    run(args: readonly string[], signal: AbortSignal): Promise<void>;
}

export const Commands: Commands = { getCommand, run };
