import { expect } from '@std/expect';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Ready } from '../../../src/commands/idea/ready.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('ready', Ready);

Deno.test('Idea Ready requires exactly one path', () => {
    const command = new Ready();
    expect(command.parseArguments(['ideas/example'])).toEqual({
        args: { help: false, ideaPath: 'ideas/example' },
        rest: [],
    });
    expect(command.parseArguments(['--', '--help'])).toEqual({
        args: { help: false, ideaPath: '--help' },
        rest: [],
    });
    for (const args of [[], ['one', 'two'], ['--json'], ['--parent', 'idea']]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});
