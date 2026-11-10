import { ClaudeConnector } from './harness/claude.ts';
import { CodexConnector } from './harness/codex.ts';
import type { HarnessConnector, InstallationTarget } from './harness/connector.ts';

export type { ConnectorFile, InstallationTarget } from './harness/connector.ts';
export type { Message, Runner, RunRequest } from './harness/runner/runner.ts';
export type { HarnessConnector };

export interface Harness {
    readonly names: readonly string[];
    get(name: string, target: InstallationTarget): HarnessConnector | null;
}

export const Harness: Harness = {
    names: ['codex', 'claude'],
    get(name: string, target: InstallationTarget): HarnessConnector | null {
        switch (name) {
            case 'codex':
                return new CodexConnector(target);
            case 'claude':
                return new ClaudeConnector(target);
        }
        return null;
    },
};
