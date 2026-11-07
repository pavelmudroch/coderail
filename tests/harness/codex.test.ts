import { homedir } from 'node:os';

import { Md } from '@md';
import { expect } from '@std/expect';
import { join, resolve } from '@std/path';

import { CodexConnector } from '../../src/harness/codex.ts';
import type { ConnectorFile } from '../../src/harness/connector.ts';

const encoder = new TextEncoder();
function file(path: string, text: string): ConnectorFile {
    return { path, content: encoder.encode(text) };
}
const metadata = '---\nname: example\ndescription: Example\n---\n';
const references =
    '<skill>absent</skill> <skill>one</skill> <skill>one</skill>\r\n```\r\n<skill>two</skill>\r\n```\r\nUnicode žluťoučký 🐈';
const replaced = '$absent $one $one\r\n```\r\n$two\r\n```\r\nUnicode žluťoučký 🐈';

Deno.test('Codex binds absolute homes once and ignores every global override locally', () => {
    const original = Deno.env.get('CODEX_HOME');
    try {
        for (const value of [undefined, '', '/custom/codex', 'relative']) {
            if (value === undefined) {
                Deno.env.delete('CODEX_HOME');
            } else {
                Deno.env.set('CODEX_HOME', value);
            }
            if (value === 'relative') {
                expect(() => new CodexConnector({ scope: 'global' })).toThrow(
                    'CODEX_HOME must be an absolute path',
                );
            } else {
                using connector = new CodexConnector({ scope: 'global' });
                expect(connector.name).toBe('codex');
                expect(connector.home).toBe(value || join(homedir(), '.codex'));
                Deno.env.set('CODEX_HOME', '/later');
                expect(connector.home).not.toBe('/later');
            }
            const target = { scope: 'local' as const, projectRoot: 'project' };
            using connector = new CodexConnector(target);
            target.projectRoot = '/later';
            expect(connector.home).toBe(resolve('project'));
        }
    } finally {
        if (original === undefined) {
            Deno.env.delete('CODEX_HOME');
        } else {
            Deno.env.set('CODEX_HOME', original);
        }
    }
});

for (const scope of ['global', 'local'] as const) {
    Deno.test(
        `Codex ${scope} preserves general instruction bytes and caller ownership`,
        async () => {
            using connector = new CodexConnector({ scope, projectRoot: '/project' });
            const source = file('source/AGENTS.md', '\uFEFF' + references);
            const before = structuredClone(source);
            const outputs = await connector.translateGlobalInstructions(source);
            expect(outputs).toEqual([file('AGENTS.md', '\uFEFF' + replaced)]);
            expect(source).toEqual(before);
            for (const output of outputs) {
                output.content.fill(0);
            }
            expect(source).toEqual(before);
            await expect(
                connector.translateGlobalInstructions({
                    path: 'source/AGENTS.md',
                    content: new Uint8Array([255]),
                }),
            ).rejects.toThrow('source/AGENTS.md: invalid UTF-8');
        },
    );

    Deno.test(
        `Codex ${scope} translates only root skills and copies every supporting byte`,
        async () => {
            using connector = new CodexConnector({ scope, projectRoot: '/project' });
            const prefix = scope === 'local' ? '.codex/' : '';
            const root =
                '\uFEFF---\r\nname: "example"\r\ndescription: "Use <skill>one</skill>"\r\n---\r\n';
            const sources = [
                file('SKILL.md', root + references),
                file('nested/notes.md', references),
                { path: 'nested/text.txt', content: new Uint8Array([255, 10]) },
                { path: 'nested/image.png', content: new Uint8Array([0, 137, 255]) },
            ];
            const before = structuredClone(sources);
            const outputs = await connector.translateSkill('example', sources);
            expect(outputs).toEqual([
                file(
                    `${prefix}skills/example/SKILL.md`,
                    root.replace('<skill>one</skill>', '$one') + replaced,
                ),
                file(`${prefix}skills/example/nested/notes.md`, references),
                {
                    path: `${prefix}skills/example/nested/text.txt`,
                    content: new Uint8Array([255, 10]),
                },
                {
                    path: `${prefix}skills/example/nested/image.png`,
                    content: new Uint8Array([0, 137, 255]),
                },
            ]);
            expect(sources).toEqual(before);
            for (const output of outputs) {
                output.content.fill(0);
            }
            expect(sources).toEqual(before);
        },
    );

    Deno.test(
        `Codex ${scope} emits explicit invocation policies with independent fixed YAML fixtures`,
        async () => {
            using connector = new CodexConnector({ scope, projectRoot: '/project' });
            const prefix = scope === 'local' ? '.codex/' : '';
            for (const unsupported of ['', 'user-invocable: false\n']) {
                for (const option of [undefined, false, true]) {
                    const flag =
                        option === undefined ? '' : `disable-model-invocation: ${option}\n`;
                    const source = file(
                        'SKILL.md',
                        `---\nname: example\ndescription: Example\n${unsupported}${flag}---\n${references}`,
                    );
                    const before = structuredClone(source);
                    const expected =
                        option === undefined
                            ? `---\nname: example\ndescription: Example\n${unsupported}---\n${replaced}`
                            : `---\nname: "example"\ndescription: "Example"\n${unsupported}---\n${replaced}`;
                    const outputs = [file(`${prefix}skills/example/SKILL.md`, expected)];
                    if (option !== undefined) {
                        outputs.push(
                            file(
                                `${prefix}skills/example/agents/openai.yaml`,
                                option
                                    ? 'policy:\n  allow_implicit_invocation: false\n'
                                    : 'policy:\n  allow_implicit_invocation: true\n',
                            ),
                        );
                    }
                    expect(await connector.translateSkill('example', [source])).toEqual(outputs);
                    expect(connector.obsoleteSkillFiles('example', outputs)).toEqual(
                        option === undefined ? [`${prefix}skills/example/agents/openai.yaml`] : [],
                    );
                    expect(source).toEqual(before);
                }
            }
        },
    );
}

const invalidMetadata: [string, string][] = [
    ['no frontmatter', 'name'],
    ['---\nname: example', 'Unclosed'],
    ['---\ninvalid yaml\n---', 'property'],
    ['---\ndescription: text\n---', 'name'],
    ['---\nname: example\n---', 'description'],
    ...['""', '"  "', 'false', '42', '[]'].flatMap((value): [string, string][] => [
        [`---\nname: ${value}\ndescription: text\n---`, 'name'],
        [`---\nname: example\ndescription: ${value}\n---`, 'description'],
    ]),
    ['---\nname: other\ndescription: text\n---', 'must equal "example"'],
];

Deno.test(
    'Codex rejects missing roots and invalid skill metadata with source and reason',
    async () => {
        using connector = new CodexConnector({ scope: 'local', projectRoot: '/project' });
        for (const files of [
            [],
            [file('nested/SKILL.md', metadata)],
            [file('support.txt', 'support')],
        ]) {
            await expect(connector.translateSkill('example', files)).rejects.toThrow(
                'skills/example/SKILL.md: missing root SKILL.md',
            );
        }
        for (const [text, reason] of [
            ...invalidMetadata,
            ...['"true"', '42', '[]', '""'].map((value): [string, string] => [
                metadata.replace('---\n', `---\ndisable-model-invocation: ${value}\n`),
                'disable-model-invocation must be a boolean',
            ]),
        ]) {
            const source = file('SKILL.md', text);
            const before = structuredClone(source);
            await expect(connector.translateSkill('example', [source])).rejects.toThrow(
                'skills/example/SKILL.md:',
            );
            await expect(connector.translateSkill('example', [source])).rejects.toThrow(reason);
            expect(source).toEqual(before);
        }
        await expect(
            connector.translateSkill('example', [
                { path: 'SKILL.md', content: new Uint8Array([255]) },
            ]),
        ).rejects.toThrow('skills/example/SKILL.md: invalid UTF-8');
    },
);

for (const scope of ['global', 'local'] as const) {
    Deno.test(
        `Codex ${scope} flattens native subagents and emits only inherited-setting TOML fields`,
        async () => {
            using connector = new CodexConnector({ scope, projectRoot: '/project' });
            const prefix = scope === 'local' ? '.codex/' : '';
            const source = file(
                'review/worker.md',
                '---\nname: worker\ndescription: \'Use "quotes", \\paths\tž <skill>one</skill>\'\nmodel: ignored\nreasoning: ignored\npermissions: ignored\n---\n' +
                    references +
                    '\n"\\\t\b\f\u0000\u0001\u007f',
            );
            const before = structuredClone(source);
            const expected =
                'name = "worker"\n' +
                'description = "Use \\"quotes\\", \\\\paths\\tž $one"\n' +
                'developer_instructions = "$absent $one $one\\r\\n```\\r\\n$two\\r\\n```\\r\\nUnicode žluťoučký 🐈\\n\\"\\\\\\t\\b\\f\\u0000\\u0001\\u007f"\n';
            const outputs = await connector.translateSubagent(source);
            expect(outputs).toEqual([file(`${prefix}agents/worker.toml`, expected)]);
            expect(source).toEqual(before);
            for (const output of outputs) {
                output.content.fill(0);
            }
            expect(source).toEqual(before);
            expect(
                await connector.translateSubagent(
                    file('other/worker.md', '---\nname: worker\ndescription: Work\n---\n'),
                ),
            ).toEqual([
                file(
                    `${prefix}agents/worker.toml`,
                    'name = "worker"\ndescription = "Work"\ndeveloper_instructions = ""\n',
                ),
            ]);
            expect(await connector.translateSubagent(file('example.md', metadata))).toEqual([
                file(
                    `${prefix}agents/example.toml`,
                    'name = "example"\ndescription = "Example"\ndeveloper_instructions = ""\n',
                ),
            ]);
        },
    );
}

Deno.test('Codex validates subagent metadata and UTF-8 with source-specific reasons', async () => {
    using connector = new CodexConnector({ scope: 'local', projectRoot: '/project' });
    for (const [text, reason] of invalidMetadata) {
        await expect(connector.translateSubagent(file('review/example.md', text))).rejects.toThrow(
            'review/example.md:',
        );
        await expect(connector.translateSubagent(file('review/example.md', text))).rejects.toThrow(
            reason,
        );
    }
    await expect(
        connector.translateSubagent({ path: 'review/worker.md', content: new Uint8Array([255]) }),
    ).rejects.toThrow('review/worker.md: invalid UTF-8');
});

Deno.test('Codex annotates unexpected parser failures with the source path', async () => {
    const parse = Md.parse;
    try {
        using connector = new CodexConnector({ scope: 'local', projectRoot: '/project' });
        Md.parse = () => Promise.reject('parser failed');
        await expect(connector.translateSubagent(file('worker.md', metadata))).rejects.toThrow(
            'worker.md: parser failed',
        );
    } finally {
        Md.parse = parse;
    }
});

Deno.test('Codex canonicalizes flagged metadata while preserving BOM and body bytes', async () => {
    using connector = new CodexConnector({ scope: 'local', projectRoot: '/project' });
    const source = file(
        'SKILL.md',
        '\uFEFF---\r\nname: example\r\ndescription: Example\r\ndisable-model-invocation: true\r\n---\r\nbody\r\n<skill>one</skill>',
    );
    const before = structuredClone(source);
    expect(await connector.translateSkill('example', [source])).toEqual([
        file(
            '.codex/skills/example/SKILL.md',
            '\uFEFF---\nname: "example"\ndescription: "Example"\n---\nbody\r\n$one',
        ),
        file(
            '.codex/skills/example/agents/openai.yaml',
            'policy:\n  allow_implicit_invocation: false\n',
        ),
    ]);
    expect(source).toEqual(before);
});
