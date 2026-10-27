import type { ConnectorFile, HarnessConnector } from './connector.ts';

export class CodexConnector implements HarnessConnector {
    readonly name = 'codex';

    get home(): string {
        throw new Error('CodexConnector.home is not implemented.');
    }

    get manifestPath(): string {
        throw new Error('CodexConnector.manifestPath is not implemented.');
    }

    translateSkill(_name: string, _files: ConnectorFile[]): Promise<ConnectorFile[]> {
        return Promise.reject(new Error('CodexConnector.translateSkill is not implemented.'));
    }

    translateGlobalInstructions(_file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.reject(
            new Error('CodexConnector.translateGlobalInstructions is not implemented.'),
        );
    }

    translateSubagent(_file: ConnectorFile): Promise<ConnectorFile[]> {
        return Promise.reject(new Error('CodexConnector.translateSubagent is not implemented.'));
    }

    [Symbol.dispose](): void {}
}
