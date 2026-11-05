import { Harness } from '@harness';
import { expect } from '@std/expect';

import { Install } from '../src/commands/install.ts';
import { Uninstall } from '../src/commands/uninstall.ts';
import { ClaudeConnector } from '../src/harness/claude.ts';
import { CodexConnector } from '../src/harness/codex.ts';

Deno.test('Harness enumerates names and renders help without constructing connectors', () => {
    const get = Harness.get;
    Harness.get = () => {
        throw new Error('Unexpected construction');
    };
    try {
        expect(Harness.names).toEqual(['codex', 'claude']);
        for (const command of [new Install(), new Uninstall()]) {
            for (const name of Harness.names) {
                expect(command.getUsage()).toContain(`- ${name}`);
            }
        }
    } finally {
        Harness.get = get;
    }
});

Deno.test('Harness constructs fresh target-bound connectors without named getters', () => {
    for (const target of [
        { scope: 'global' },
        { scope: 'local', projectRoot: '/project' },
    ] as const) {
        using codex = Harness.get('codex', target);
        using claude = Harness.get('claude', target);
        using another = Harness.get('codex', target);
        expect(codex).toBeInstanceOf(CodexConnector);
        expect(claude).toBeInstanceOf(ClaudeConnector);
        expect(codex).not.toBe(another);
        expect(Harness.get('unknown', target)).toBe(null);
    }
});
