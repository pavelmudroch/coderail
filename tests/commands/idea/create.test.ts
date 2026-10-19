import { expect } from '@std/expect';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Create } from '../../../src/commands/idea/create.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('create', Create);

Deno.test('Idea create parses a title and optional parent path', () => {
    const command = new Create();
    expect(command.parseArguments(['New idea'])).toEqual({
        args: { help: false, ideaTitle: 'New idea' },
        rest: [],
    });
    for (
        const args of [
            ['-p', 'ideas/parent', 'New idea'],
            ['New idea', '--parent', 'ideas/parent'],
            ['--parent=ideas/parent', 'New idea'],
        ]
    ) {
        expect(command.parseArguments(args)).toEqual({
            args: { help: false, ideaTitle: 'New idea', parent: 'ideas/parent' },
            rest: [],
        });
    }
    expect(command.parseArguments(['--', '--help'])).toEqual({
        args: { help: false, ideaTitle: '--help' },
        rest: [],
    });
    for (
        const args of [
            [],
            ['one', 'two'],
            ['-p'],
            ['--parent'],
            ['--parent='],
            ['--parent', '--help'],
            ['--parent', 'idea'],
            ['--json'],
        ]
    ) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});
