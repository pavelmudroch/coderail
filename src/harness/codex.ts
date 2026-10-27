import type { HarnessConnector } from './connector.ts';

export class CodexConnector implements HarnessConnector {
    readonly name = 'codex';

    [Symbol.dispose](): void {}
}
