import { createContext, type RuntimeContext } from './runtime/context.ts';
import { registerSignalHandlers, type SignalHandlers } from './runtime/signals.ts';
import { cleanup } from './runtime/cleanup.ts';
import type { Command, GlobalArguments } from '@commands';

export type { RuntimeContext };

export interface Runtime {
    /**
     * Register signal handlers for the runtime environment.
     * @returns The disposable registered signal handlers object.
     */
    registerSignalHandlers(): SignalHandlers;
    /**
     * Create a new runtime context based on the provided global arguments and command requirements.
     * @param global The global arguments parsed from the command line.
     * @param command The command-specific requirements.
     */
    createContext(
        global: GlobalArguments,
        command: Pick<Command, 'requiresInit'>,
    ): Promise<RuntimeContext>;
    /**
     * Perform cleanup tasks for the runtime environment.
     *
     * **Important: This function must not never throw!**
     */
    cleanup(): Promise<void>;
}

export const Runtime: Runtime = {
    registerSignalHandlers,
    createContext,
    cleanup,
};
