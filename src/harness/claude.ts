import type { ConnectorFile, HarnessConnector } from './connector.ts';

export class ClaudeConnector implements HarnessConnector {
    readonly name = 'claude';

    get home(): string {
        throw new Error('ClaudeConnector.home is not implemented.');
    }

    get manifestPath(): string {
        throw new Error('ClaudeConnector.manifestPath is not implemented.');
    }

    translateSkill(_name: string, _files: ConnectorFile[]): Promise<ConnectorFile[]> {
        return Promise.reject(new Error('ClaudeConnector.translateSkill is not implemented.'));
    }

    translateGlobalInstructions(_file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.reject(
            new Error('ClaudeConnector.translateGlobalInstructions is not implemented.'),
        );
    }

    translateSubagent(_file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.reject(new Error('ClaudeConnector.translateSubagent is not implemented.'));
    }

    [Symbol.dispose](): void {}
}
