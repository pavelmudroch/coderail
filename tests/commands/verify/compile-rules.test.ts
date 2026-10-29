import { expect } from '@std/expect';
import { compileRules } from '../../../src/commands/verify/compile-rules.ts';

Deno.test('compileRules matches bounded full-path globs literally and case-sensitively', () => {
    const cases: [string, string[], string[]][] = [
        ['src/*.ts', ['src/.hidden.ts', 'src/a.ts'], [
            'SRC/a.ts',
            'src/a/b.ts',
            'x/src/a.ts',
            'src/a.ts\n',
        ]],
        ['src/**/file.ts', ['src/file.ts', 'src/a/b/file.ts'], ['src/file.ts/extra']],
        ['**', ['', '.hidden', 'a/b\nc'], []],
        ['', [''], ['a']],
        ['${prefix:*}**/x', ['x/x', '/x'], ['x']],
        ['${path:**}/**/x', ['x', 'a/x'], []],
        ['**/${file:*}', ['x', 'a/x'], []],
        ['${path:**}/**/${file:*}', ['x', 'a/x'], []],
        ['${prefix:*}**/${file:*}', ['a/x'], ['x']],
        ['?.ts', ['😀.ts', 'a.ts'], ['ab.ts', '/.ts']],
        ['a[bc]{d}(e)+.^$|\\', ['a[bc]{d}(e)+.^$|\\'], ['abde']],
        ['a**/b', ['a/x/b', 'a/b'], ['ab']],
    ];
    for (const [pattern, matches, misses] of cases) {
        const [rule] = compileRules([{ pattern, commands: [['check']] }]);
        for (const path of matches) {
            expect(rule?.match(path)).toEqual({ commands: [['check']], requires: [] });
        }
        for (const path of misses) expect(rule?.match(path)).toBeUndefined();
    }
});

Deno.test('compileRules captures greedily with backtracking and expands each argument once', () => {
    const [rule] = compileRules([{
        pattern: 'src/${path:**}/${file:*}.ts',
        commands: [[], ['check', '${path}', '${file}', 'prefix ${file} suffix', '${path}/${file}']],
        requires: ['tests/${path}/${file}.test.ts'],
    }]);
    expect(rule?.match('src/main.ts')).toEqual({
        commands: [['check', '', 'main', 'prefix main suffix', '/main']],
        requires: ['tests//main.test.ts'],
    });
    expect(rule?.match('src/a/b/two words.ts')).toEqual({
        commands: [['check', 'a/b', 'two words', 'prefix two words suffix', 'a/b/two words']],
        requires: ['tests/a/b/two words.test.ts'],
    });
    const [greedy] = compileRules([{
        pattern: '${first:*}-${second:*}.ts',
        commands: [['${first}', '${second}']],
    }]);
    expect(greedy?.match('a-b-c.ts')?.commands).toEqual([['a-b', 'c']]);
    const [once] = compileRules([{
        pattern: '${value:*}',
        commands: [['${value}', '${value}${value}']],
        requires: ['${value}'],
    }]);
    expect(once?.match('${value}')).toEqual({
        commands: [['${value}', '${value}${value}']],
        requires: ['${value}'],
    });
    const [chained] = compileRules([{
        pattern: '${a:*}/${b:**}/${c:*}',
        commands: [['${a}', '${b}', '${c}']],
    }]);
    expect(chained?.match('a/b/c')?.commands).toEqual([['a', 'b', 'c']]);
    expect(chained?.match('a/c')?.commands).toEqual([['a', '', 'c']]);
    const [unicode] = compileRules([{ pattern: '${_name1:?}', commands: [['${_name1}']] }]);
    expect(unicode?.match('😀')?.commands).toEqual([['😀']]);
    expect(unicode?.match('ab')).toBeUndefined();
    const [rootCapture] = compileRules([{ pattern: '${path:**}/x', commands: [['${path}']] }]);
    expect(rootCapture?.match('x')?.commands).toEqual([['']]);
    expect(rootCapture?.match('a/b/x')?.commands).toEqual([['a/b']]);
});

Deno.test('compileRules validates every capture and reference before matching', () => {
    for (
        const pattern of [
            '${x}',
            '${x:*',
            '${:*}',
            '${1x:*}',
            '${a-b:*}',
            '${x:${y:*}}',
            '${x:*}${x:?}',
        ]
    ) {
        expect(() => compileRules([{ pattern: 'ok', commands: [] }, { pattern, commands: [] }]))
            .toThrow(`Rule 1: invalid pattern ${JSON.stringify(pattern)}`);
    }
    for (
        const rule of [
            { pattern: 'unmatched', commands: [['${missing}']] },
            { pattern: 'unmatched', commands: [], requires: ['${missing}'] },
        ]
    ) {
        expect(() => compileRules([rule])).toThrow('Rule 0: undefined reference ${missing}');
    }
});

Deno.test('compileRules preserves rule order, argument boundaries, and empty command lists', () => {
    const rules = compileRules([
        { pattern: '*', commands: [['first', 'two words', '']] },
        { pattern: '*', commands: [] },
        { pattern: '*', commands: [[], ['last'], []] },
    ]);
    expect(rules.map((rule) => rule.match('x'))).toEqual([
        { commands: [['first', 'two words', '']], requires: [] },
        { commands: [], requires: [] },
        { commands: [['last']], requires: [] },
    ]);
    expect(compileRules([])).toEqual([]);
});
