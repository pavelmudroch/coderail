import { ClaudeConnector } from './harness/claude.ts';
import { CodexConnector } from './harness/codex.ts';
import type { HarnessConnector } from './harness/connector.ts';

export type { ConnectorFile } from './harness/connector.ts';
export type { HarnessConnector };

export interface Harness {
    readonly names: readonly string[];
    readonly codex: HarnessConnector;
    readonly claude: HarnessConnector;
    get(name: string): HarnessConnector;
}

export const Harness: Harness = {
    names: ['codex', 'claude'],
    get codex() {
        return new CodexConnector();
    },
    get claude() {
        return new ClaudeConnector();
    },
    get(name): HarnessConnector {
        switch (name) {
            case 'codex':
                return Harness.codex;
            case 'claude':
                return Harness.claude;
            default:
                throw new Error(`Unknown harness "${name}".`);
        }
    },
};
