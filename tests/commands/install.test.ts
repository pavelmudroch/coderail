import { expect } from '@std/expect';
import { Install } from '../../src/commands/install.ts';
import { UsageError } from '../../src/cli/usage-error.ts';
import { Harness } from '@harness';

Deno.test('Install parses optional harnesses and flags', () => {
    const command = new Install();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([])).toEqual({
        args: { help: false, force: false, yes: false, harnesses: [] },
        rest: [],
    });
    expect(command.parseArguments(new Array<string>(1))).toEqual(command.parseArguments([]));
    for (const flags of [['-f', '-y'], ['--force', '--yes']]) {
        expect(command.parseArguments(['codex', ...flags, 'claude'])).toEqual({
            args: { help: false, force: true, yes: true, harnesses: ['codex', 'claude'] },
            rest: [],
        });
    }
    expect(command.parseArguments(['codex', '--', '--help', '-f', '-y'])).toEqual({
        args: { help: false, force: false, yes: false, harnesses: ['codex', '--help', '-f', '-y'] },
        rest: [],
    });
});

Deno.test('Install handles help and rejects invalid options', () => {
    const command = new Install();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments([help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    for (const option of ['--unknown', '-x', '--help=value', '--force=false', '--yes=true']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
    expect(command.getUsage()).toContain('cr install [--help] [--force] [--yes] [<harness> ...]');
    for (const harness of Object.values(Harness)) {
        expect(command.getUsage()).toContain(`- ${harness.name}`);
    }
});

Deno.test('Install run remains a stub', async () => {
    const command = new Install();
    await command.run({
        context: { currentWorkingDirectory: '/project', installRoot: '/install' },
        configuration: { logLevel: 'normal', noColor: false, nonInteractive: false, verify: [] },
        parsedArguments: command.parseArguments([]),
        signal: new AbortController().signal,
    });
});
