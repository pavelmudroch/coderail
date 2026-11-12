import { expect } from '@std/expect';

import { type ConfigDocument, parse, type ParseResult } from '../../src/conf/parse.ts';
import { stringify } from '../../src/conf/stringify.ts';

async function read(text: string): ReturnType<typeof parse> {
    return await parse(new Blob([text]).stream());
}

Deno.test('Conf::stringify round trips values, sections and supported comments', async () => {
    const values: ParseResult = {
        description: 'A "template"\\with\ncontrols\t\b\f\r',
        enabled: true,
        disabled: false,
        missing: null,
        count: -12.5,
        commands: [['echo', 'echo'], [], [null, true, 3]],
        empty: {},
        nested: { innerKey: { valueName: 'yes' } },
        rules: [{ pattern: '*', settings: { enabled: false } }, { pattern: 'src/*' }],
    };
    const document: ConfigDocument = {
        values,
        comments: new Map([
            ['description', ['Description']],
            ['nested', ['Nested']],
            ['nested.innerKey.valueName', ['Value']],
            ['commands', ['Dropped array']],
            ['rules.0.pattern', ['Dropped element']],
        ]),
    };
    const result = await read(stringify(document));
    expect(result.toObject()).toEqual(values);
    expect(result.getComments()).toEqual(
        new Map([
            ['description', ['Description']],
            ['nested', ['Nested']],
            ['nested.innerKey.valueName', ['Value']],
        ]),
    );
    expect(stringify({ values: {}, comments: new Map() })).toBe('');
    expect(
        (await read(stringify({ values: { description: '' }, comments: new Map() }))).toObject(),
    ).toEqual({ description: '' });
});

Deno.test('Conf::stringify preserves decimal magnitudes and parser key conventions', async () => {
    const values: ParseResult = {
        negativeZero: -0,
        tiny: 1e-7,
        negativeTiny: -1e-30,
        huge: 1e25,
        negativeHuge: -1.234e22,
        fractionExponent: 1.2e-7,
        minimum: Number.MIN_VALUE,
        maximum: Number.MAX_VALUE,
        URLValue: 'capital',
        _leadingKey: 'underscore',
        __proto__: null,
        nested: { constructor: 'own' },
    };
    const text = stringify({ values, comments: new Map() });
    expect(text).toContain('negative_tiny = -0.000000000000000000000000000001');
    expect(text).toContain('negative_huge = -12340000000000000000000');
    expect((await read(text)).toObject()).toEqual(values);
    const parsed = await read('__proto__ = "own"\nUpperCase = 3\n[constructor]\nvalue = false');
    expect(
        (await read(stringify({ values: parsed.toObject(), comments: new Map() }))).toObject(),
    ).toEqual(parsed.toObject());
});
