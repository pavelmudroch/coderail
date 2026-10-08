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

function read(text: string): Promise<ParseResult> {
    return parse(stream([encoder.encode(text)]));
}

async function invalid(text: string): Promise<void> {
    await expect(read(text), text).rejects.toBeInstanceOf(SyntaxError);
}

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
        expect(await parse(stream(Array.from(bytes, (byte) => Uint8Array.of(byte))))).toEqual(
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
            expect(await parse(input)).toEqual(expected);
            expect(input.locked).toBe(false);
        }
        expect(await parse(stream([]))).toEqual({});
        expect(await parse(stream([new Uint8Array()]))).toEqual({});
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
            }
            catch (error) {
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
