import { expect } from '@std/expect';
import { Commands } from '@commands';
import { UsageError } from '../../src/cli/usage-error.ts';
import { Idea } from '../../src/commands/idea.ts';
import { Map } from '../../src/commands/idea/map.ts';
import { Create } from '../../src/commands/idea/create.ts';
import { Split } from '../../src/commands/idea/split.ts';
import { Ready } from '../../src/commands/idea/ready.ts';
import { Reforge } from '../../src/commands/idea/reforge.ts';
import { runStub } from './idea/helpers.ts';

Deno.test('Idea execution is a placeholder', async () => {
    await runStub(new Idea());
});

Deno.test('Idea handles parent help and stops before child arguments', () => {
    const command = new Idea();
    expect(command.requiresInit).toBe(false);
    expect(command.parseArguments([])).toEqual({ args: { help: false }, rest: [] });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: { help: false },
        rest: [],
    });
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, 'create', '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
        expect(parsed.rest).toEqual([]);
        const childArguments = command.parseArguments(['create', help, 'argument']);
        expect(command.shouldHandleHelp(childArguments)).toBe(false);
        expect(childArguments).toEqual({
            args: { help: false, command: 'create' },
            rest: [help, 'argument'],
        });
    }
    expect(command.parseArguments(['create', '--', '--help', '-x'])).toEqual({
        args: { help: false, command: 'create' },
        rest: ['--', '--help', '-x'],
    });
    expect(command.parseArguments(['--', 'create', '--help'])).toEqual({
        args: { help: false, command: 'create' },
        rest: ['--help'],
    });
    expect(command.getUsage()).toContain('cr idea [options] <command>');
});

Deno.test('Idea reports missing commands, unknown commands, and invalid parent options', () => {
    const command = new Idea();
    for (const args of [[], ['--'], ['unknown'], ['--', '--help']]) {
        try {
            command.getSubcommand(command.parseArguments(args));
            throw new Error('Expected a usage error.');
        } catch (error) {
            expect(error).toBeInstanceOf(UsageError);
            expect((error as UsageError).usage()).toBe(command.getUsage());
            expect((error as Error).message).toBe(
                args.length === 0 || args.length === 1 && args[0] === '--'
                    ? 'An idea subcommand is required.'
                    : `Unknown idea subcommand "${args.at(-1)}".`,
            );
        }
    }
    for (const option of ['--unknown', '-x', '--help=value']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
});

for (
    const [name, Child] of [
        ['map', Map],
        ['create', Create],
        ['split', Split],
        ['ready', Ready],
        ['reforge', Reforge],
    ] as const
) {
    Deno.test(`Idea dispatches ${name} and scopes help to the requested command`, () => {
        const root = Commands.cr();
        const globalArguments = root.parseArguments(['idea', name, '--help']);
        const idea = root.getSubcommand(globalArguments);
        if (!(idea instanceof Idea)) {
            throw new Error('Expected the Idea command.');
        }
        const parentArguments = idea.parseArguments(globalArguments.rest);
        expect(idea.shouldHandleHelp(parentArguments)).toBe(false);
        const child = idea.getSubcommand(parentArguments);
        expect(child).toBeInstanceOf(Child);
        const childArguments = child.parseArguments(parentArguments.rest);
        expect(child.shouldHandleHelp(childArguments)).toBe(true);
        expect(child.getUsage()).toContain(`cr idea ${name} [options]`);
        expect(child.getSubcommand(childArguments)).toBeUndefined();
    });
}
