import { expect } from '@std/expect';
import { type ConnectorFile, Harness, type HarnessConnector } from '../../src/harness.ts';
import { ClaudeConnector } from '../../src/harness/claude.ts';

Deno.test('ClaudeConnector preserves registry names and safe disposal', () => {
    const connector: HarnessConnector = new ClaudeConnector();
    const disposable: Disposable = connector;
    expect(connector.name).toBe('claude');
    expect(Harness.claude.name).toBe('claude');
    disposable[Symbol.dispose]();
    Harness.claude[Symbol.dispose]();
});

Deno.test('ClaudeConnector throws synchronously for unavailable locations', () => {
    const connector: HarnessConnector = new ClaudeConnector();
    expect(() => connector.home).toThrow(Error);
    expect(() => connector.manifestPath).toThrow(Error);
});

Deno.test('ClaudeConnector rejects every translation without changing input', async () => {
    const connector: HarnessConnector = new ClaudeConnector();
    const file: ConnectorFile = { path: 'SKILL.md', content: new Uint8Array([0, 255]) };
    const files: ConnectorFile[] = [file];
    const translations: Promise<ConnectorFile[]>[] = [
        connector.translateSkill('example', files),
        connector.translateSkill('empty', []),
        connector.translateGlobalInstructions(file),
        connector.translateSubagent(file),
    ];
    for (const translation of translations) {
        expect(translation).toBeInstanceOf(Promise);
        await expect(translation).rejects.toBeInstanceOf(Error);
    }
    expect(files).toEqual([{ path: 'SKILL.md', content: new Uint8Array([0, 255]) }]);
});
