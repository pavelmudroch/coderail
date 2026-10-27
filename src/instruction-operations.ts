import type { HarnessConnector } from './harness/connector.ts';
import { install } from './instruction-operations/install.ts';
import { uninstall } from './instruction-operations/uninstall.ts';

export interface OperationOptions {
    force: boolean;
    confirmation: 'prompt' | 'yes' | 'no';
    nonInteractive: boolean;
    signal: AbortSignal;
}

export interface FileOutcome {
    path: string;
    status: 'installed' | 'removed' | 'skipped' | 'already-missing';
}

export interface OperationResult {
    outcomes: FileOutcome[];
    error?: unknown;
}

export interface InstructionOperations {
    install(
        connector: HarnessConnector,
        bundleRoot: string,
        options: OperationOptions,
    ): Promise<OperationResult>;
    uninstall(connector: HarnessConnector, options: OperationOptions): Promise<OperationResult>;
}

export const InstructionOperations: InstructionOperations = { install, uninstall };
