import { expect } from '@std/expect';

import { merge } from '../../src/conf/merge.ts';
import { type ConfigDocument, parse } from '../../src/conf/parse.ts';
import { stringify } from '../../src/conf/stringify.ts';

Deno.test(
    'Conf::merge clones inputs and normalizes rules and whole commands in order',
    async () => {
        const first: ConfigDocument = {
            values: {
                noColor: false,
                loop: { codex: { model: 'old', effort: 'high' } },
                verify: {
                    pre: [
                        ['echo', 'x', 'x'],
                        ['echo', 'x', 'x'],
                    ],
                    post: [['end']],
                    rules: [
                        {
                            pattern: '*',
                            commands: [
                                ['a', 'b'],
                                ['a', 'b'],
                            ],
                            requires: ['x', 'x'],
                        },
                    ],
                },
                tags: ['one', 'one'],
                replacement: { old: true },
                scalar: 1,
            },
            comments: new Map([['loop.codex.model', ['first']]]),
        };
        const second: ConfigDocument = {
            values: {
                noColor: true,
                loop: { codex: { model: 'new' }, claude: {} },
                verify: {
                    pre: [
                        ['echo', 'x', 'x'],
                        ['x', 'echo', 'x'],
                    ],
                    post: [['end'], ['next']],
                    rules: [
                        { requires: ['x'], commands: [['a', 'b']], pattern: '*' },
                        { pattern: '*', commands: [['b', 'a']], requires: ['x'] },
                        { pattern: '*', commands: [['a', 'b']], requires: ['y'] },
                        { pattern: '*', commands: [['a', 'b']], requires: ['x'], extra: true },
                    ],
                },
                tags: ['two'],
                replacement: null,
                scalar: { nested: 2 },
            },
            comments: new Map([
                ['loop.codex.model', ['second']],
                ['noColor', ['flag']],
            ]),
        };
        const snapshot = structuredClone([first, second]);
        const merged = merge([first, second]);
        expect(merged.values).toEqual({
            noColor: true,
            loop: { codex: { model: 'new', effort: 'high' }, claude: {} },
            verify: {
                pre: [
                    ['echo', 'x', 'x'],
                    ['x', 'echo', 'x'],
                ],
                post: [['end'], ['next']],
                rules: [
                    { pattern: '*', commands: [['a', 'b']], requires: ['x'] },
                    { pattern: '*', commands: [['b', 'a']], requires: ['x'] },
                    { pattern: '*', commands: [['a', 'b']], requires: ['y'] },
                    { pattern: '*', commands: [['a', 'b']], requires: ['x'], extra: true },
                ],
            },
            tags: ['one', 'two'],
            replacement: null,
            scalar: { nested: 2 },
        });
        expect(merged.comments.get('loop.codex.model')).toEqual(['first', 'second']);
        expect(merged.comments.get('noColor')).toEqual(['flag']);
        expect(merge([merged, second]).values).toEqual(merged.values);
        expect([first, second]).toEqual(snapshot);
        merged.comments.get('noColor')?.push('changed');
        (merged.values.loop as { codex: { model: string } }).codex.model = 'changed';
        expect([first, second]).toEqual(snapshot);
        const parsed = await parse(new Blob([stringify(merge([first, second]))]).stream());
        expect(parsed.toObject()).toEqual(merge([first, second]).values);
        expect(merge([])).toEqual({ values: {}, comments: new Map() });
    },
);

Deno.test(
    'Conf::merge combines independently parsed documents and retains distinct rule fields',
    async () => {
        const sources: ConfigDocument[] = [];
        for (const text of [
            `# Old model
[loop.codex]
# First choice
model = "old"
effort = "high"
[[verify.rules]]
pattern = "one"
commands = []
[[verify.rules]]
pattern = "one"
commands = []
requires = []
`,
            `# New model
[loop.codex]
model = "new" # Second choice
[[verify.rules]]
pattern = "two"
commands = []
`,
        ]) {
            const parsed = await parse(new Blob([text]).stream());
            sources.push({ values: parsed.toObject(), comments: parsed.getComments() });
        }
        const merged = merge(sources);
        expect(merged.values).toEqual({
            loop: { codex: { model: 'new', effort: 'high' } },
            verify: {
                rules: [
                    { pattern: 'one', commands: [] },
                    { pattern: 'one', commands: [], requires: [] },
                    { pattern: 'two', commands: [] },
                ],
            },
        });
        expect(merged.comments).toEqual(
            new Map([
                ['loop.codex', ['Old model', 'New model']],
                ['loop.codex.model', ['First choice', 'Second choice']],
            ]),
        );
        const text = stringify(merged);
        expect(text).toContain('# First choice\n# Second choice\nmodel = "new"');
        const roundTrip = await parse(new Blob([text]).stream());
        expect(roundTrip.toObject()).toEqual(merged.values);
        expect(roundTrip.getComments()).toEqual(merged.comments);
        expect(sources[0]?.comments.get('loop.codex')).toEqual(['Old model']);
    },
);
