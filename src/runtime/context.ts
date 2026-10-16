import type { GlobalArguments } from '@cli';

export type RuntimeContext = {
    currentWorkingDirectory: string;
    installRoot: string;
    repositoryRoot?: string;
};

export function createContext(
    _global: GlobalArguments,
    _command: { requiresRepository: boolean },
): Promise<RuntimeContext> {
    throw new Error('Not implemented');
}
