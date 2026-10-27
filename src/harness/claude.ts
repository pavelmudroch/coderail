import type { HarnessConnector } from './connector.ts';

export class ClaudeConnector implements HarnessConnector {
    readonly name = 'claude';

    [Symbol.dispose](): void {}
}
