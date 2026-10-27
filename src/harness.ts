import { ClaudeConnector } from './harness/claude.ts';
import { CodexConnector } from './harness/codex.ts';
import type { HarnessConnector } from './harness/connector.ts';

export type { HarnessConnector };

export interface Harness {
    readonly codex: HarnessConnector;
    readonly claude: HarnessConnector;
}

export const Harness: Harness = {
    codex: new CodexConnector(),
    claude: new ClaudeConnector(),
};
