import { expect } from '@std/expect';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Split } from '../../../src/commands/idea/split.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('split', Split);

Deno.test('Idea split requires an idea reference and at least two child titles', () => {
    const command = new Split();
    for (const childTitles of [['First', 'Second'], ['First', 'Second', 'Third']]) {
        expect(command.parseArguments(['ideas/parent', ...childTitles])).toEqual({
            args: { help: false, ideaReference: 'ideas/parent', childTitles },
            rest: [],
        });
    }
    expect(command.parseArguments(['ideas/parent', '--', '--help', '-x'])).toEqual({
        args: { help: false, ideaReference: 'ideas/parent', childTitles: ['--help', '-x'] },
        rest: [],
    });
    for (const args of [[], ['idea'], ['idea', 'First'], ['--json'], ['--parent', 'idea']]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});
