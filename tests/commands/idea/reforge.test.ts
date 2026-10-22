import { expect } from '@std/expect';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Reforge } from '../../../src/commands/idea/reforge.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('reforge', Reforge);

Deno.test('Idea Reforge requires exactly one idea reference', () => {
    const command = new Reforge();
    expect(command.parseArguments(['ideas/example'])).toEqual({
        args: { help: false, ideaReference: 'ideas/example' },
        rest: [],
    });
    expect(command.parseArguments(['--', '--help'])).toEqual({
        args: { help: false, ideaReference: '--help' },
        rest: [],
    });
    for (const args of [[], ['one', 'two'], ['--json'], ['--parent', 'idea']]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});
