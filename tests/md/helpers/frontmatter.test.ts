import { expect } from '@std/expect';
import {
    type Frontmatter,
    parseFrontmatter,
    stringifyFrontmatter,
} from '../../../src/md/helpers/frontmatter.ts';

Deno.test('Md frontmatter parses scalars and both array forms', () => {
    expect(parseFrontmatter([
        'title: A simple idea',
        'quoted: "true"',
        "single: 'it''s ready'",
        'count: -2.5e2',
        'ready: false',
        'tags: ["cli, tools", parser, true, 2, "a\\"b"]',
        'empty: []',
        'items:',
        '  - one',
        '  - "2"',
        '  - 3',
        '  - true',
    ].join('\r\n'))).toEqual({
        title: 'A simple idea',
        quoted: 'true',
        single: "it's ready",
        count: -250,
        ready: false,
        tags: ['cli, tools', 'parser', true, 2, 'a"b'],
        empty: [],
        items: ['one', '2', 3, true],
    });
});

Deno.test('Md frontmatter stringify quotes strings and emits block arrays', () => {
    const attributes: Frontmatter = {
        title: '123',
        'key: with punctuation': 'value',
        '': 'empty key',
        ready: true,
        count: -0,
        empty: [],
        items: ['', 'a: b', 'a,b', '"quote"', '\\', false, 1.5],
    };
    const serialized = stringifyFrontmatter(attributes);
    expect(serialized).toContain('title: "123"');
    expect(serialized).toContain('empty: []');
    expect(serialized).toContain('items:\n  - ""\n  - "a: b"');
    expect(parseFrontmatter(serialized)).toEqual(attributes);
    expect(parseFrontmatter('')).toEqual({});
    expect(stringifyFrontmatter({})).toBe('');
});

Deno.test('Md frontmatter rejects malformed or unsupported syntax with line numbers', () => {
    for (
        const source of [
            'value: 1\nvalue: 2',
            'value: [1,]',
            'value: [1',
            'value: [[1]]',
            'value: ["unfinished]',
            'value: {nested: true}',
            'value: |\n  multiline',
            'value: >',
            'value: "line\\nline"',
            "value: 'unfinished",
            'value: "unfinished',
            'value: 1e999',
            'value:\nnext: true',
            'value:',
            'value:\n  - one\n   - two',
            '  - orphan',
            'value:\n  - [nested]',
            'value:\n  -',
            'value:\n  nested: true',
            'value: one\rtwo',
            'value: one # comment',
            'value: &anchor',
            'invalid property',
        ]
    ) {
        expect(() => parseFrontmatter(source), source).toThrow(/line \d+/);
    }
});

Deno.test('Md frontmatter rejects unsupported values when stringifying', () => {
    for (const value of [NaN, Infinity, 'a\nb', 'a\rb', null, {}, [[1]], undefined]) {
        expect(() => stringifyFrontmatter({ value } as Frontmatter)).toThrow(TypeError);
    }
    expect(() => stringifyFrontmatter({ 'bad\nkey': true })).toThrow(TypeError);
});

Deno.test('Md frontmatter treats prototype property names as ordinary keys', () => {
    const attributes = parseFrontmatter('__proto__: safe\nconstructor: true');
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(Object.hasOwn(attributes, '__proto__')).toBe(true);
    expect(attributes['__proto__']).toBe('safe');
    expect(parseFrontmatter(stringifyFrontmatter(attributes))).toEqual(attributes);
});

Deno.test('Md frontmatter parses quoted inline items and bare apostrophes', () => {
    expect(parseFrontmatter(`items: ['it''s', 'a,b', "[]{}", don't, a"b, false]\n\nnext: yes\n`))
        .toEqual({
            items: ["it's", 'a,b', '[]{}', "don't", 'a"b', false],
            next: 'yes',
        });
    expect(parseFrontmatter("'it''s': value\nspaces: [ ]\nlist:\n  - one\n\nnext: end")).toEqual({
        "it's": 'value',
        spaces: [],
        list: ['one'],
        next: 'end',
    });
});

Deno.test('Md frontmatter handles literal backslashes and commas after escaped apostrophes', () => {
    expect(parseFrontmatter(String.raw`items: ['a\', 'it''s, ready', "a\\", "a\",b"]`)).toEqual({
        items: ['a\\', "it's, ready", 'a\\', 'a",b'],
    });
});
