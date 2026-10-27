import { expect } from '@std/expect';
import { Harness } from '@harness';
import { CodexConnector } from '../src/harness/codex.ts';
import { ClaudeConnector } from '../src/harness/claude.ts';
import { Install } from '../src/commands/install.ts';
import { Uninstall } from '../src/commands/uninstall.ts';

Deno.test('Harness enumerates names and renders help without resolving connectors', () => {
    const original = Object.getOwnPropertyDescriptors(Harness);
    for (const name of ['codex', 'claude']) {
        Object.defineProperty(Harness, name, {
            get(): never {
                throw new Error('Unexpected construction');
            },
            configurable: true,
        });
    }
    Harness.get = () => {
        throw new Error('Unexpected construction');
    };
    try {
        expect(Harness.names).toEqual(['codex', 'claude']);
        for (const command of [new Install(), new Uninstall()]) {
            for (const name of Harness.names) expect(command.getUsage()).toContain(`- ${name}`);
        }
    } finally {
        Object.defineProperties(Harness, original);
    }
});

Deno.test('Harness constructs fresh selected connectors and preserves facade access', () => {
    using codex = Harness.get('codex');
    using claude = Harness.get('claude');
    using compatibilityCodex = Harness.codex;
    using compatibilityClaude = Harness.claude;
    expect(codex).toBeInstanceOf(CodexConnector);
    expect(claude).toBeInstanceOf(ClaudeConnector);
    expect(compatibilityCodex).toBeInstanceOf(CodexConnector);
    expect(compatibilityClaude).toBeInstanceOf(ClaudeConnector);
    expect(codex).not.toBe(compatibilityCodex);
    expect(claude).not.toBe(compatibilityClaude);
    expect(() => Harness.get('unknown')).toThrow('Unknown harness "unknown".');
});
