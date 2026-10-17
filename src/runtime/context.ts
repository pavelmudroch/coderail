import type { Command, GlobalArguments } from '@commands';

export type RuntimeContext = {
    currentWorkingDirectory: string;
    installRoot: string;
    repositoryRoot?: string;
};

export function createContext(
    _global: GlobalArguments,
    _command: Pick<Command, 'requiresInit'>,
): Promise<RuntimeContext> {
    throw new Error('Not implemented');
}
