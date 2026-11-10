import { homedir } from 'node:os';

import { Md } from '@md';
import { expect } from '@std/expect';
import { join, resolve } from '@std/path';

import { ClaudeConnector } from '../../src/harness/claude.ts';
import type { ConnectorFile } from '../../src/harness/connector.ts';
import { executionTests } from './execution.test.ts';

const encoder = new TextEncoder();
function file(path: string, text: string): ConnectorFile {
    return { path, content: encoder.encode(text) };
}
const metadata = '---\nname: example\ndescription: Example skill\n---\n';

Deno.test('Claude binds an absolute home once and ignores global overrides locally', () => {
    const original = Deno.env.get('CLAUDE_CONFIG_DIR');
    try {
        for (const value of [undefined, '', '/custom/claude', 'relative']) {
            if (value === undefined) {
                Deno.env.delete('CLAUDE_CONFIG_DIR');
            } else {
                Deno.env.set('CLAUDE_CONFIG_DIR', value);
            }
            if (value === 'relative') {
                expect(() => new ClaudeConnector({ scope: 'global' })).toThrow('absolute');
            } else {
                using connector = new ClaudeConnector({ scope: 'global' });
                expect(connector.name).toBe('claude');
                expect(connector.home).toBe(value || join(homedir(), '.claude'));
                Deno.env.set('CLAUDE_CONFIG_DIR', '/later');
                expect(connector.home).not.toBe('/later');
            }
            const target = { scope: 'local' as const, projectRoot: '/project' };
            using connector = new ClaudeConnector(target);
            target.projectRoot = '/other';
            expect(connector.home).toBe(resolve('/project/.claude'));
        }
    } finally {
        if (original === undefined) {
            Deno.env.delete('CLAUDE_CONFIG_DIR');
        } else {
            Deno.env.set('CLAUDE_CONFIG_DIR', original);
        }
    }
});

Deno.test(
    'Claude preserves source bytes and replaces every skill tag across all instruction text',
    async () => {
        using connector = new ClaudeConnector({ scope: 'local', projectRoot: '/project' });
        const references =
            '<skill>absent</skill> <skill>one</skill> <skill>one</skill>\r\n```\r\n<skill>two</skill>\r\n```\r\n<other>keep</other> /existing';
        const replaced = '/absent /one /one\r\n```\r\n/two\r\n```\r\n<other>keep</other> /existing';
        const skill = file(
            'SKILL.md',
            '\uFEFF---\r\nname: "example"\r\ndescription: "Use <skill>one</skill>"\r\n---\r\n' +
                references,
        );
        const support = file('nested/notes.txt', references);
        const binary = {
            path: 'nested/image.png',
            content: new Uint8Array([137, 80, 0, 255, 13, 10]),
        };
        const nulBinary = {
            path: 'nested/data.bin',
            content: encoder.encode('data\0<skill>unchanged</skill>'),
        };
        const sources = [skill, support, binary, nulBinary];
        const before = sources.map((source) => ({
            path: source.path,
            content: source.content.slice(),
        }));
        expect(await connector.translateSkill('example', sources)).toEqual([
            file(
                'skills/example/SKILL.md',
                '\uFEFF---\r\nname: "example"\r\ndescription: "Use /one"\r\n---\r\n' + replaced,
            ),
            file('skills/example/nested/notes.txt', replaced),
            { path: 'skills/example/nested/image.png', content: binary.content },
            { path: 'skills/example/nested/data.bin', content: nulBinary.content },
        ]);
        expect(sources).toEqual(before);
        const agent = file(
            'review/worker.md',
            '---\nname: worker\ndescription: Work\n---\n' + references,
        );
        expect(await connector.translateSubagent(agent)).toEqual([
            file(
                'agents/review/worker.md',
                '---\nname: worker\ndescription: Work\n---\n' + replaced,
            ),
        ]);
        expect(
            await connector.translateGlobalInstructions(file('AGENTS.md', '\uFEFF' + references)),
        ).toEqual([file('rules/coderail.md', '\uFEFF' + replaced)]);
        expect(agent.content).toEqual(
            encoder.encode('---\nname: worker\ndescription: Work\n---\n' + references),
        );
    },
);

Deno.test(
    'Claude validates skill root presence and source-specific skill and subagent metadata',
    async () => {
        using connector = new ClaudeConnector({ scope: 'local', projectRoot: '/project' });
        for (const files of [
            [],
            [file('nested/SKILL.md', metadata)],
            [file('support.txt', 'support')],
        ]) {
            await expect(connector.translateSkill('example', files)).rejects.toThrow(
                'example/SKILL.md',
            );
        }
        for (const text of [
            'no frontmatter',
            '---\nname: example',
            '---\ninvalid yaml\n---',
            '---\ndescription: text\n---',
            '---\nname: example\n---',
            ...['""', '"  "', 'false', '42', '[]'].flatMap((value) => [
                `---\nname: ${value}\ndescription: text\n---`,
                `---\nname: example\ndescription: ${value}\n---`,
            ]),
            '---\nname: other\ndescription: text\n---',
        ]) {
            await expect(
                connector.translateSkill('example', [file('SKILL.md', text)]),
            ).rejects.toThrow('example/SKILL.md');
            await expect(
                connector.translateSubagent(file('review/example.md', text)),
            ).rejects.toThrow('review/example.md');
        }
        await expect(
            connector.translateSubagent(file('review/worker.md', metadata)),
        ).rejects.toThrow('worker');
    },
);

Deno.test('Claude rejects invalid UTF-8 Markdown at every instruction location', async () => {
    using connector = new ClaudeConnector({ scope: 'local', projectRoot: '/project' });
    const invalid = { path: 'SKILL.md', content: new Uint8Array([255]) };
    await expect(connector.translateSkill('example', [invalid])).rejects.toThrow('SKILL.md');
    await expect(
        connector.translateSkill('example', [
            file('SKILL.md', metadata),
            { ...invalid, path: 'nested/notes.md' },
        ]),
    ).rejects.toThrow('nested/notes.md');
    await expect(connector.translateSubagent({ ...invalid, path: 'worker.md' })).rejects.toThrow(
        'worker.md',
    );
    await expect(
        connector.translateGlobalInstructions({ ...invalid, path: 'AGENTS.md' }),
    ).rejects.toThrow('AGENTS.md');
});

Deno.test(
    'Claude retains invocation metadata independently without defaults or serialization',
    async () => {
        using connector = new ClaudeConnector({ scope: 'local', projectRoot: '/project' });
        for (const user of ['', 'user-invocable: true\n', 'user-invocable: false\n']) {
            for (const model of [
                '',
                'disable-model-invocation: true\n',
                'disable-model-invocation: false\n',
            ]) {
                const text = `---\nname: example\ndescription: 'Example'\n${user}${model}---\nbody\n`;
                expect(await connector.translateSkill('example', [file('SKILL.md', text)])).toEqual(
                    [file('skills/example/SKILL.md', text)],
                );
            }
        }
    },
);

Deno.test('Claude annotates unexpected parser failures with their source path', async () => {
    const parse = Md.parse;
    try {
        using connector = new ClaudeConnector({ scope: 'local', projectRoot: '/project' });
        Md.parse = () => Promise.reject('parser failed');
        await expect(connector.translateSubagent(file('worker.md', metadata))).rejects.toThrow(
            'worker.md: parser failed',
        );
    } finally {
        Md.parse = parse;
    }
});

executionTests(
    'claude',
    (scope) =>
        new ClaudeConnector(
            scope === 'global' ? { scope } : { scope, projectRoot: '/installation-only' },
        ),
);
