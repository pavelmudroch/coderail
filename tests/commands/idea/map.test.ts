import { expect } from '@std/expect';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Map } from '../../../src/commands/idea/map.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('map', Map);

Deno.test('Idea map accepts only the JSON flag and no positional arguments', () => {
    const command = new Map();
    expect(command.parseArguments([])).toEqual({ args: { help: false, json: false }, rest: [] });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: { help: false, json: false },
        rest: [],
    });
    expect(command.parseArguments(['--json'])).toEqual({
        args: { help: false, json: true },
        rest: [],
    });
    for (const args of [['idea'], ['--', '--json'], ['--json=true'], ['--parent', 'idea']]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});
