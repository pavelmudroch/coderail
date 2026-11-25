import { expect } from '@std/expect';

import { Apply } from '../../../../src/commands/archive/apply.ts';
import { parseArchiveArguments } from '../../../../src/commands/archive/helpers/parse-arguments.ts';
import { Plans } from '../../../../src/commands/archive/plans.ts';

Deno.test('archive argument parser keeps options and positionals in their respective roles', () => {
    const plans = new Plans();
    const apply = new Apply();
    expect(parseArchiveArguments([], plans, 0)).toEqual({
        args: { help: false, json: false, yes: false },
        rest: [],
    });
    expect(parseArchiveArguments(['left=right', '--json', '--', '--help'], plans, 2)).toEqual({
        args: { help: false, json: true, yes: false },
        rest: ['left=right', '--help'],
    });
    expect(
        parseArchiveArguments(['batch', '--yes', 'description', '--json'], apply, 2, true),
    ).toEqual({
        args: { help: false, json: true, yes: true },
        rest: ['batch', 'description'],
    });
    for (const flag of ['-h', '--help']) {
        expect(parseArchiveArguments(['batch', flag, '--invalid'], apply, 2, true)).toEqual({
            args: { help: true, json: false, yes: false },
            rest: ['batch'],
        });
    }
    expect(parseArchiveArguments(['--', '--json'], plans, 1).rest).toEqual(['--json']);
    expect(parseArchiveArguments(['--', '--yes'], plans, 1).rest).toEqual(['--yes']);
});

Deno.test('archive argument parser rejects malformed options and invalid positional counts', () => {
    const plans = new Plans();
    const parse = (args: string[], allowYes = false): ReturnType<typeof parseArchiveArguments> =>
        parseArchiveArguments(args, plans, 1, allowYes);
    for (const flag of ['--help=false', '--json=', '--yes=false']) {
        expect(() => parse([flag], true)).toThrow(
            `Option "${flag.split('=')[0]}" does not take a value.`,
        );
    }
    for (const flag of ['--unknown', '--unknown=value', '--yes', '--yes=false']) {
        expect(() => parse([flag])).toThrow(`Unknown option "${flag}".`);
    }
    for (const args of [[], [''], ['--']]) {
        expect(() => parse(args)).toThrow('Missing required arguments.');
    }
    expect(() => parse(['batch', '--', 'extra'])).toThrow('Too many arguments.');
});
