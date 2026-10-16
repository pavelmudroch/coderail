import { expect } from '@std/expect';
import { parse, type ParseResult } from '../../src/conf/parse.ts';

const encoder = new TextEncoder();

function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller): void {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
}

async function read(text: string): Promise<ParseResult> {
    return (await parse(stream([encoder.encode(text)]))).toObject();
}

async function invalid(text: string): Promise<void> {
    await expect(read(text), text).rejects.toBeInstanceOf(SyntaxError);
}

Deno.test('Conf::parse converts snake_case keys and preserves source metadata', async () => {
    const parsed = await parse(stream([encoder.encode(
        'default_harness="codex"\n[server_options.http_client]\nrequest_timeout=30\n[[build_rules]]\nfile_pattern="*.ts"',
    )]));
    expect(parsed.toObject()).toEqual({
        defaultHarness: 'codex',
        serverOptions: { httpClient: { requestTimeout: 30 } },
        buildRules: [{ filePattern: '*.ts' }],
    });
    expect(parsed.getMeta('defaultHarness')).toEqual({
        key: 'default_harness',
        line: 1,
        column: 17,
        type: 'string',
    });
    expect(parsed.getMeta('serverOptions.httpClient.requestTimeout')).toEqual({
        key: 'server_options.http_client.request_timeout',
        line: 3,
        column: 17,
        type: 'number',
    });
    expect(parsed.getMeta(['buildRules', 0, 'filePattern'], 'key')).toEqual({
        key: 'build_rules.0.file_pattern',
        line: 5,
        column: 1,
        type: 'string',
    });
    expect(parsed.getMeta('server_options.http_client.request_timeout'))
        .toEqual(parsed.getMeta('serverOptions.httpClient.requestTimeout'));
    expect(await read('alreadyCamel=1\n_name2=2\n__proto__=3\nmany_word_key=4'))
        .toEqual({ alreadyCamel: 1, _name2: 2, ['__proto__']: 3, manyWordKey: 4 });
    await invalid('some_key=1\nsomeKey=2');
    await invalid('[some_key]\n[someKey]');
});

Deno.test('Conf::parse grammar', async (test) => {
    await test.step('Scalars, names, escapes and comments', async () => {
        expect(
            await read(String.raw`0 = null
A = true
a = false
Z = true
z = false
_name2 = "#é😀"
escapes = "\"\\\/\b\f\n\r\t\u0000\u0041\uabcd\uABCD\uD83D\uDE00\uD800"
hexBounds = "\u000f\u000F"
empty = ""
space = " "
 # comment
 tab = 1 # comment
`),
        ).toEqual({
            '0': null,
            A: true,
            a: false,
            Z: true,
            z: false,
            _name2: '#é😀',
            escapes: '"\\/\b\f\n\r\t\0A\uabcd\uABCD😀\ud800',
            hexBounds: '\u000f\u000f',
            empty: '',
            space: ' ',
            tab: 1,
        });
        for (const text of ['', ' \t', '# comment', '\n\r\n#end']) {
            expect(await read(text)).toEqual({});
        }
        expect(await read('\tkey\t=\t1\t#end\r\nother=2\n')).toEqual({ key: 1, other: 2 });
        for (const name of ['', 'a-b', 'é', '"a"', 'a.b', 'a b', '@', 'a\u00a0']) {
            await invalid(`${name}=1`);
        }
        for (
            const value of [
                'truf',
                'falsX',
                'nulk',
                'tr',
                'fal',
                'nul',
                'True',
                'FALSE',
                'Null',
                'undefined',
                'word',
                "'a'",
                '"""a"""',
                '{}',
                ';comment',
            ]
        ) {
            await invalid(`a=${value}`);
        }
        for (
            const value of [
                '"a\nb"',
                '"a\rb"',
                '"a\tb"',
                '"\0"',
                String.raw`"\u123`,
                '"a',
                '"\\',
                String.raw`"\x00"`,
                String.raw`"\u123"`,
                String.raw`"\u12xz"`,
            ]
        ) {
            await invalid(`a=${value}`);
        }
        for (let control = 0; control < 32; control++) {
            await invalid(`a="${String.fromCharCode(control)}"`);
        }
    });
    await test.step('Strict finite decimal numbers', async () => {
        const cases: [string, number][] = [
            ['0', 0],
            ['-0', -0],
            ['-12', -12],
            ['1.5', 1.5],
            ['1_000', 1000],
            ['0.0_5', 0.05],
            ['-1_2.3_4', -12.34],
            ['9007199254740993', 9007199254740992],
            [`0.${'0'.repeat(400)}1`, 0],
            ['123456789', 123456789],
        ];
        for (const [text, value] of cases) expect((await read(`n=${text}`)).n).toBe(value);
        for (
            const value of [
                '01',
                '0_1',
                '.5',
                '5.',
                '+1',
                '1e3',
                '0x10',
                'NaN',
                'Infinity',
                '1__0',
                '_1',
                '1_',
                '-',
                '-01',
                '1._0',
                '1.0_',
                '1.2.3',
                '1 2',
                '9'.repeat(400),
            ]
        ) {
            await invalid(`n=${value}`);
        }
    });
    await test.step('Recursive arrays and line boundaries', async () => {
        expect(
            await read(
                'a=[]\nb=[1,"x",true,false,null,[],[2,[3]],]\nc=[\n# ] [\n["[#]",\n],\n-2, # comment\n]\n',
            ),
        ).toEqual({
            a: [],
            b: [1, 'x', true, false, null, [], [2, [3]]],
            c: [['[#]'], -2],
        });
        for (
            const text of [
                'a=[,]',
                'a=[1,,]',
                'a=[1 2]',
                'a=[[] []]',
                'a=[{}]',
                'a=[1\n2]',
                'a=[true\nfalse]',
                'a=[tru\ne]',
                'a=[1.\n2]',
                'a=[-\n1]',
                'a=["a\nb"]',
                'a=["a\\\nb"]',
                'a=[',
                'a=[[1]',
                'a=\n1',
                'a=1 b=2',
                '[a] x=1',
                '[a\n]',
                '[[a]\n]',
                '[]',
                '[[]]',
                '[a .b]',
                '[a. b]',
                '[a..b]',
                '[.a]',
                '[a.]',
                '[a',
                '[[a]',
                '[[ a ] ]',
                'a=1;',
                '\ufeffa=1',
                '#comment\r',
                'a=1\r',
                'a=1\rb=2',
            ]
        ) {
            await invalid(text);
        }
    });
});

Deno.test('Conf::parse namespaces', async (test) => {
    await test.step('Implicit and explicit parents and assignment targets', async () => {
        expect(await read('[a.b]\nx=1\n[a]\ny=2\n[other]\nx=3\n[a.c]\nx=4')).toEqual({
            a: { b: { x: 1 }, y: 2, c: { x: 4 } },
            other: { x: 3 },
        });
        expect(await read('[a.b]')).toEqual(await read('[a]\n[a.b]'));
        expect(await read('[[a]]\n[[a]]')).toEqual({ a: [{}, {}] });
        expect(await read('[a]\nx=1\ny=2')).toEqual({ a: { x: 1, y: 2 } });
    });
    await test.step('Latest element at every ancestor, absolute paths and per-object state', async () => {
        expect(
            await read(`root = [1,[true,[]]]
[[groups]]
name="first"
[groups.meta.child]
v=1
[groups.meta]
x=2
[[groups.items]]
id=1
[groups.items.detail]
v="one"
[[groups.items]]
id=2
[unrelated]
v=0
[groups.items.detail]
v="two"
[[groups]]
name="second"
[groups.meta.child]
v=[]
[[groups.items]]
[groups.items.detail]
v="three"
`),
        ).toEqual({
            root: [1, [true, []]],
            groups: [
                {
                    name: 'first',
                    meta: { child: { v: 1 }, x: 2 },
                    items: [{ id: 1, detail: { v: 'one' } }, { id: 2, detail: { v: 'two' } }],
                },
                { name: 'second', meta: { child: { v: [] } }, items: [{ detail: { v: 'three' } }] },
            ],
            unrelated: { v: 0 },
        });
        expect(await read('[[a]]\n[a.x]\n[[a]]\n[[a.x]]')).toEqual({ a: [{ x: {} }, { x: [{}] }] });
    });
    await test.step('Own properties and ordinary prototypes', async () => {
        const result = await read(
            '__proto__=1\nconstructor=2\ntoString=3\n[prototype.__proto__]\nconstructor=4\n[[hasOwnProperty]]\n__proto__=5',
        );
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toEqual({
            value: 1,
            enumerable: true,
            writable: true,
            configurable: true,
        });
        expect(result.constructor).toBe(2);
        expect(result.toString).toBe(3);
        expect(Object.getPrototypeOf(result.prototype)).toBe(Object.prototype);
        expect(result.prototype).toEqual({ ['__proto__']: { constructor: 4 } });
        expect(result.hasOwnProperty).toEqual([{ ['__proto__']: 5 }]);
        expect(await read('[__proto__]\nx=1\n[constructor]\nx=2')).toEqual({
            ['__proto__']: { x: 1 },
            constructor: { x: 2 },
        });
    });
    await test.step('Duplicates and member-kind conflicts in both orders', async () => {
        for (
            const text of [
                'x=1\nx=1',
                '[a]\nx=1\nx=2',
                '[a]\n[a]',
                '[a.b]\n[a]\n[a]',
                '[a.b]\n[a]\nb=1',
                '[a]\nx=1\n[a.x]',
                '[a]\nx=[]\n[[a.x]]',
                'a=1\n[a.b]',
                'a=[]\n[a.b]',
                'a=null\n[a.b]',
                'a="x"\n[a.b]',
                'a=true\n[a.b]',
                '[[a]]\n[a]',
                '[a]\n[[a]]',
                'a=[]\n[[a]]',
                'a=1\n[[a]]',
                'a=1\n[a]',
                'a=[]\n[a]',
                '[[a]]\n[]\na=[]',
                '[a]\n[]\na=1',
                '[a[0]]',
                '[[a.0]]\n[a.0]',
                '[root.a]\n[root]\na=[]',
                '[[root.a]]\n[root]\na=[]',
                '[root]\na=[]\n[[root.a]]',
            ]
        ) await invalid(text);
        for (const value of ['1', '[]', 'true', 'null', '"x"']) {
            await invalid(`[root]\na=${value}\n[root.a]`);
            await invalid(`[root]\na=${value}\n[[root.a]]`);
            await invalid(`[root.a]\n[root]\na=${value}`);
            await invalid(`[[root.a]]\n[root]\na=${value}`);
        }
    });
});

Deno.test('Conf::parse streams', async (test) => {
    await test.step('Byte splits, empty chunks and EOF', async () => {
        const text = String.raw`name="é😀\u0041\n#"
list=[true,[null,12.3], # ]
"x",]
[a.b]
x=false`;
        const bytes = encoder.encode(text.replaceAll('\n', '\r\n'));
        const expected = await read(text);
        expect((await parse(stream(Array.from(bytes, (byte) => Uint8Array.of(byte))))).toObject())
            .toEqual(
                expected,
            );
        for (let split = 0; split <= bytes.length; split++) {
            const input = stream([
                new Uint8Array(),
                bytes.slice(0, split),
                new Uint8Array(),
                bytes.slice(split),
                new Uint8Array(),
            ]);
            expect((await parse(input)).toObject()).toEqual(expected);
            expect(input.locked).toBe(false);
        }
        expect((await parse(stream([]))).toObject()).toEqual({});
        expect((await parse(stream([new Uint8Array()]))).toObject()).toEqual({});
        for (const suffix of ['', '\n', '\r\n']) {
            expect(await read(`a=1${suffix}`)).toEqual({ a: 1 });
        }
    });
    await test.step('UTF-8 failures and text diagnostic positions', async () => {
        for (
            const bytes of [
                Uint8Array.of(0xff),
                Uint8Array.of(0xc3),
                Uint8Array.of(0xe2, 0x28, 0xa1),
            ]
        ) {
            const input = stream([encoder.encode('#ok\n'), bytes]);
            await expect(parse(input)).rejects.toThrow('line 2');
            expect(input.locked).toBe(false);
        }
        for (
            const [text, line, column] of [
                ['a=1\nb=@', 2, 3],
                ['a=[\n1,\n]\nb=@', 4, 3],
                ['a="😀" @', 1, 8],
                ['a="\\u12x4"', 1, 8],
                ['a="x', 1, 5],
                ['a=[\n1', 2, 2],
                ['a=[\n', 1, 4],
            ] as const
        ) {
            try {
                await read(text);
                throw new Error('Expected syntax failure');
            } catch (error) {
                expect(error).toBeInstanceOf(SyntaxError);
                expect((error as Error).message).toContain(`line ${line}`);
                expect((error as Error).message).toContain(`column ${column}`);
            }
        }
    });
    await test.step('Read failures, cancellation ownership and cleanup failures', async () => {
        const failure = new Error('read failed');
        const input = new ReadableStream<Uint8Array>({
            pull(): void {
                throw failure;
            },
        });
        await expect(parse(input)).rejects.toBe(failure);
        expect(input.locked).toBe(false);
        let cancelled = false;
        const malformed = new ReadableStream<Uint8Array>({
            start(controller): void {
                controller.enqueue(encoder.encode('a=@\n'));
            },
            cancel(): void {
                cancelled = true;
            },
        });
        await expect(parse(malformed)).rejects.toBeInstanceOf(SyntaxError);
        expect(malformed.locked).toBe(false);
        expect(cancelled).toBe(false);
        await malformed.cancel();
        expect(cancelled).toBe(true);
        const cleanup = new Error('cleanup failed');
        for (const original of [failure, undefined]) {
            const fake = {
                getReader(): {
                    read(): Promise<ReadableStreamReadResult<Uint8Array>>;
                    releaseLock(): void;
                } {
                    return {
                        read(): Promise<ReadableStreamReadResult<Uint8Array>> {
                            return original
                                ? Promise.reject(original)
                                : Promise.resolve({ done: true, value: undefined });
                        },
                        releaseLock(): void {
                            throw cleanup;
                        },
                    };
                },
            } as unknown as ReadableStream<Uint8Array>;
            await expect(parse(fake)).rejects.toBe(original ?? cleanup);
        }
    });
});

Deno.test('Conf::parse metadata helper', async (test) => {
    await test.step('Value/key locations, scalar types and nested bracket arrays', async () => {
        const parsed = await parse(stream([encoder.encode(
            '\tname = "😀\\n" # comment\r\nlist = [\r\n  null, [true,],\r\n]\r\nempty=[]\nflag=false\nn=1_000',
        )]));
        expect(parsed.toObject()).toEqual({
            name: '😀\n',
            list: [null, [true]],
            empty: [],
            flag: false,
            n: 1000,
        });
        for (
            const [path, line, column, type] of [
                ['name', 1, 9, 'string'],
                ['list', 2, 8, 'array'],
                ['list.0', 3, 3, 'null'],
                ['list.1', 3, 9, 'array'],
                ['list.1.0', 3, 10, 'boolean'],
                ['empty', 5, 7, 'array'],
                ['flag', 6, 6, 'boolean'],
                ['n', 7, 3, 'number'],
            ] as const
        ) {
            expect(parsed.getMeta(path)).toEqual({ key: path, line, column, type });
            expect(parsed.getMeta(path, 'value')).toEqual(parsed.getMeta(path));
        }
        expect(parsed.getMeta('name', 'key')).toEqual({
            key: 'name',
            line: 1,
            column: 2,
            type: 'string',
        });
        const path: readonly (string | number)[] = ['list', 1, 0];
        expect(parsed.getMeta(path)).toEqual(parsed.getMeta('list.1.0'));
        expect(parsed.getMeta('list.0', 'key')).toBeUndefined();
    });

    await test.step('Array closure preserves opening locations and trailing-text diagnostics', async () => {
        const parsed = await parse(stream([encoder.encode('values = [[], [1, 2],\n  [3],\n]')]));
        expect(parsed.toObject()).toEqual({ values: [[], [1, 2], [3]] });
        expect(parsed.getMeta('values')).toEqual({
            key: 'values',
            line: 1,
            column: 10,
            type: 'array',
        });
        expect(parsed.getMeta('values.0')).toEqual({
            key: 'values.0',
            line: 1,
            column: 11,
            type: 'array',
        });
        expect(parsed.getMeta('values.1')).toEqual({
            key: 'values.1',
            line: 1,
            column: 15,
            type: 'array',
        });
        expect(parsed.getMeta('values.2')).toEqual({
            key: 'values.2',
            line: 2,
            column: 3,
            type: 'array',
        });
        for (
            const [text, line, column] of [
                ['values = [[], [1, 2]] @', 1, 23],
                ['values = [\n  [3],\n] @', 3, 3],
            ] as const
        ) {
            await expect(read(text)).rejects.toThrow(
                `Unexpected trailing text at line ${line}, column ${column}`,
            );
        }
    });

    await test.step('Explicit and implicit namespaces and zero-based object-array elements', async () => {
        const parsed = await parse(stream([encoder.encode(
            '[a.b]\nx=1\n[a]\n[[a.items]]\nid=2\n[[a.items]]\n[a.items.detail]\nbase="url"',
        )]));
        expect(parsed.getMeta('a')).toEqual({ key: 'a', line: 3, column: 1, type: 'object' });
        expect(parsed.getMeta('a', 'key')).toEqual({
            key: 'a',
            line: 3,
            column: 2,
            type: 'object',
        });
        expect(parsed.getMeta('a.b')).toEqual({ key: 'a.b', line: 1, column: 1, type: 'object' });
        expect(parsed.getMeta('a.b', 'key')).toEqual({
            key: 'a.b',
            line: 1,
            column: 4,
            type: 'object',
        });
        expect(parsed.getMeta('a.items')).toEqual({
            key: 'a.items',
            line: 4,
            column: 1,
            type: 'array',
        });
        expect(parsed.getMeta('a.items', 'key')).toEqual({
            key: 'a.items',
            line: 4,
            column: 5,
            type: 'array',
        });
        expect(parsed.getMeta('a.items.0')).toEqual({
            key: 'a.items.0',
            line: 4,
            column: 1,
            type: 'object',
        });
        expect(parsed.getMeta('a.items.1')).toEqual({
            key: 'a.items.1',
            line: 6,
            column: 1,
            type: 'object',
        });
        expect(parsed.getMeta('a.items.1', 'key')).toBeUndefined();
        expect(parsed.getMeta(['a', 'items', 1, 'detail', 'base']))
            .toEqual({ key: 'a.items.1.detail.base', line: 8, column: 6, type: 'string' });
        expect(parsed.getMeta('a.items.1.detail.base', 'key'))
            .toEqual({ key: 'a.items.1.detail.base', line: 8, column: 1, type: 'string' });
        expect(parsed.getMeta('a.items.1.id')).toBeUndefined();
        const implicit = await parse(stream([encoder.encode('[a.b]')]));
        expect(implicit.getMeta('a')).toEqual({ key: 'a', line: 1, column: 2, type: 'object' });
        expect(implicit.getMeta('a', 'key')).toEqual(implicit.getMeta('a'));
    });

    await test.step('Missing and invalid paths, numeric object keys and prototype names', async () => {
        const parsed = await parse(stream([encoder.encode(
            'a=[1]\n[nums]\n03=true\n3=false\n__proto__="safe"',
        )]));
        for (
            const path of [
                '',
                '.',
                'missing',
                'a.',
                'a..0',
                'a.03',
                'a.-1',
                'a.3x',
                'a.0.thing',
                'a.1',
                'constructor',
                'nums.toString',
                [],
                ['a', -1],
                ['a', 0.5],
                ['a', NaN],
                ['a', Infinity],
                ['a', 2 ** 53],
            ]
        ) {
            expect(parsed.getMeta(path)).toBeUndefined();
            expect(parsed.getMeta(path, 'key')).toBeUndefined();
        }
        expect(parsed.getMeta('nums.03')).toEqual({
            key: 'nums.03',
            line: 3,
            column: 4,
            type: 'boolean',
        });
        expect(parsed.getMeta(['nums', 3])).toEqual(parsed.getMeta('nums.3'));
        expect(parsed.getMeta('nums.__proto__')).toEqual({
            key: 'nums.__proto__',
            line: 5,
            column: 11,
            type: 'string',
        });
        const empty = await parse(stream([]));
        expect(empty.toObject()).toEqual({});
        expect(empty.getMeta([])).toBeUndefined();
    });

    await test.step('Every resolved value has a token, header or implicit namespace location', async () => {
        const parsed = await parse(stream([encoder.encode(
            '[implicit.child]\nvalue=1\n[[elements]]\n[ elements.detail ]\nempty=[]',
        )]));
        for (
            const [path, line, column, type] of [
                ['implicit', 1, 2, 'object'],
                ['implicit.child', 1, 1, 'object'],
                ['implicit.child.value', 2, 7, 'number'],
                ['elements', 3, 1, 'array'],
                ['elements.0', 3, 1, 'object'],
                ['elements.0.detail', 4, 1, 'object'],
                ['elements.0.detail.empty', 5, 7, 'array'],
            ] as const
        ) {
            expect(parsed.getMeta(path)).toEqual({ key: path, line, column, type });
        }
        expect(parsed.getMeta('elements.0.detail', 'key'))
            .toEqual({ key: 'elements.0.detail', line: 4, column: 12, type: 'object' });
        expect(parsed.getMeta('elements.0.missing')).toBeUndefined();
    });

    await test.step('Returned objects and metadata cannot mutate the original parse', async () => {
        const parsed = await parse(stream([encoder.encode('a=[1,[2]]\n[[b]]\nx=3')]));
        const object = parsed.toObject();
        const original = parsed.toObject();
        const a = object.a as (number | number[])[];
        a.reverse();
        expect(Array.isArray(object.b)).toBe(true);
        if (typeof (object.b as ParseResult[])[0] === 'object') {
            // deno-lint-ignore no-non-null-assertion -- condition ensures the object exists
            (object.b as ParseResult[])[0]!.x = 99;
        }
        object.extra = true;
        const meta = parsed.getMeta('b.0.x');
        if (meta === undefined) throw new Error('Expected metadata');
        meta.line = 99;
        expect(parsed.toObject()).toEqual(original);
        expect(parsed.getMeta('b.0.x')).toEqual({
            key: 'b.0.x',
            line: 3,
            column: 3,
            type: 'number',
        });
        const { toObject, getMeta } = parsed;
        expect(toObject()).toEqual(original);
        expect(getMeta('a.0')).toEqual({ key: 'a.0', line: 1, column: 4, type: 'number' });
    });

    await test.step('Metadata is independent of UTF-8 chunks and physical line endings', async () => {
        const text = 's="é😀"\na=[\n1,[false],\n]\n[[group]]\nx=-1_2.3';
        const expected = await parse(stream([encoder.encode(text)]));
        for (const ending of ['\n', '\r\n']) {
            const bytes = encoder.encode(text.replaceAll('\n', ending));
            const inputs = [Array.from(bytes, (byte) => Uint8Array.of(byte))];
            for (let split = 0; split <= bytes.length; split++) {
                inputs.push([bytes.slice(0, split), bytes.slice(split)]);
            }
            for (const chunks of inputs) {
                const actual = await parse(stream(chunks));
                expect(actual.toObject()).toEqual(expected.toObject());
                for (
                    const path of ['s', 'a', 'a.0', 'a.1', 'a.1.0', 'group', 'group.0', 'group.0.x']
                ) {
                    for (const part of ['key', 'value'] as const) {
                        expect(actual.getMeta(path, part)).toEqual(expected.getMeta(path, part));
                    }
                }
            }
        }
    });
});
