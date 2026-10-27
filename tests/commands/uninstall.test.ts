import { expect } from '@std/expect';
import { Uninstall } from '../../src/commands/uninstall.ts';
import { UsageError } from '../../src/cli/usage-error.ts';
import { Harness } from '@harness';

Deno.test('Uninstall parses optional harnesses and flags', () => {
    const command = new Uninstall();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([])).toEqual({
        args: { help: false, force: false, yes: false, self: false, harnesses: [] },
        rest: [],
    });
    expect(command.parseArguments(new Array<string>(1))).toEqual(command.parseArguments([]));
    for (const flags of [['-f', '-y'], ['--force', '--yes']]) {
        expect(command.parseArguments(['codex', ...flags, 'claude'])).toEqual({
            args: {
                help: false,
                force: true,
                yes: true,
                self: false,
                harnesses: ['codex', 'claude'],
            },
            rest: [],
        });
    }
    expect(command.parseArguments(['codex', '--', '--help', '-f', '-y'])).toEqual({
        args: {
            help: false,
            force: false,
            yes: false,
            self: false,
            harnesses: ['codex', '--help', '-f', '-y'],
        },
        rest: [],
    });
});

Deno.test('Uninstall handles help and rejects invalid options', () => {
    const command = new Uninstall();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    for (
        const option of [
            '--unknown',
            '-x',
            '--help=value',
            '--force=false',
            '--yes=true',
            '--self=true',
        ]
    ) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
    expect(command.getUsage()).toContain(
        'cr uninstall [--help] [--force] [--yes] [--self | <harness> ...]',
    );
    for (const harness of Object.values(Harness)) {
        expect(command.getUsage()).toContain(`- ${harness.name}`);
    }
});

Deno.test('Uninstall accepts --self without harnesses and rejects conflicting arguments', () => {
    const command = new Uninstall();
    expect(command.parseArguments(['--self', '--force', '--yes'])).toEqual({
        args: { help: false, force: true, yes: true, self: true, harnesses: [] },
        rest: [],
    });
    for (const args of [['--self', 'codex'], ['codex', '--self'], ['--self', '--', 'claude']]) {
        expect(() => command.parseArguments(args)).toThrow(
            'Option "--self" cannot be used with specified harnesses.',
        );
    }
    expect(command.shouldHandleHelp(command.parseArguments(['--self', 'codex', '--help'])))
        .toBe(true);
});

Deno.test('Uninstall run remains a stub', async () => {
    const command = new Uninstall();
    await command.run({
        context: { currentWorkingDirectory: '/project', installRoot: '/install' },
        configuration: { logLevel: 'normal', noColor: false, nonInteractive: false, verify: [] },
        parsedArguments: command.parseArguments([]),
        signal: new AbortController().signal,
    });
});
