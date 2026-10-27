import { expect } from '@std/expect';
import { type ConnectorFile, Harness, type HarnessConnector } from '../../src/harness.ts';
import { CodexConnector } from '../../src/harness/codex.ts';

Deno.test('CodexConnector preserves registry names and safe disposal', () => {
    const connector: HarnessConnector = new CodexConnector();
    const disposable: Disposable = connector;
    expect(connector.name).toBe('codex');
    expect(Harness.codex.name).toBe('codex');
    disposable[Symbol.dispose]();
    Harness.codex[Symbol.dispose]();
});

Deno.test('CodexConnector throws synchronously for unavailable locations', () => {
    const connector: HarnessConnector = new CodexConnector();
    expect(() => connector.home).toThrow(Error);
    expect(() => connector.manifestPath).toThrow(Error);
});

Deno.test('CodexConnector rejects every translation without changing input', async () => {
    const connector: HarnessConnector = new CodexConnector();
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
