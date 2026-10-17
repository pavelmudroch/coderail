import { expect } from '@std/expect';
import { Commands, type GlobalArguments, type ParsedArguments } from '@commands';
import { UsageError } from '../../src/cli/usage-error.ts';

function parse(args: readonly string[]): ParsedArguments<GlobalArguments> {
    return Commands.cr().parseArguments(args);
}

function defaults(): GlobalArguments {
    return {
        command: undefined,
        cwd: undefined,
        help: false,
        version: false,
        nonInteractive: false,
        noColor: false,
        verbose: false,
        quiet: false,
    };
}

function expectUsageError(args: readonly string[], message: string): void {
    try {
        parse(args);
        throw new Error('Expected parseArguments to throw.');
    } catch (error) {
        expect(error).toBeInstanceOf(UsageError);
        expect((error as Error).message).toBe(message);
        expect((error as UsageError).usage()).toContain('Usage:');
    }
}

Deno.test('Cr handles global help and exposes root usage', () => {
    const command = Commands.cr();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        expect(command.shouldHandleHelp(command.parseArguments([help]))).toBe(true);
        expect(command.shouldHandleHelp(command.parseArguments(['command', help]))).toBe(false);
    }
    expect(command.getUsage()).toContain('cr [options] <command>');
});

Deno.test('Cr runs without a repository or child command', async () => {
    const command = Commands.cr();
    const parsedArguments = command.parseArguments([]);
    expect(command.requiresRepository).toBe(false);
    expect(command.getSubcommand(parsedArguments)).toBeUndefined();
    await expect(command.run({
        context: { currentWorkingDirectory: '/project', installRoot: '/install' },
        configuration: {
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: [],
        },
        parsedArguments,
        signal: new AbortController().signal,
    })).resolves.toBeUndefined();
});

Deno.test('Cr::parseArguments parses global options and commands', () => {
    expect(parse([])).toEqual({ args: defaults(), rest: [] });

    expect(parse([
        '--version',
        '--non-interactive',
        '--no-color',
        '-v',
        '--cwd',
        'project',
        'status',
        'argument',
    ])).toEqual({
        args: {
            command: 'status',
            cwd: 'project',
            help: false,
            version: true,
            nonInteractive: true,
            noColor: true,
            verbose: true,
            quiet: false,
        },
        rest: ['argument'],
    });

    expect(parse(['--help', '--quiet', 'command'])).toEqual({
        args: {
            ...defaults(),
            help: true,
        },
        rest: [],
    });

    expect(parse(['--cwd=project', 'status'])).toEqual({
        args: { ...defaults(), command: 'status', cwd: 'project' },
        rest: [],
    });

    const cwdOptionWithoutValue = new String('--cwd=');
    cwdOptionWithoutValue.split = () => [];
    expect(parse([cwdOptionWithoutValue as unknown as string])).toEqual({
        args: { ...defaults(), cwd: './' },
        rest: [],
    });
});

Deno.test('Cr::parseArguments stops at global help and forwards command help', () => {
    for (const help of ['-h', '--help']) {
        expect(parse([help, '--unknown', 'command'])).toEqual({
            args: { ...defaults(), help: true },
            rest: [],
        });

        expect(parse(['command', help, 'argument'])).toEqual({
            args: { ...defaults(), command: 'command' },
            rest: [help, 'argument'],
        });
    }
});

Deno.test('Cr::parseArguments preserves command arguments and post-command options', () => {
    expect(parse(['command', '--unknown', '-x', '-', 'argument'])).toEqual({
        args: { ...defaults(), command: 'command' },
        rest: ['--unknown', '-x', '-', 'argument'],
    });

    expect(parse(['command', '-xy', 'argument'])).toEqual({
        args: { ...defaults(), command: 'command' },
        rest: ['-x', '-y', 'argument'],
    });

    expect(parse(['command', '--', '--help', '-v', 'argument'])).toEqual({
        args: { ...defaults(), command: 'command' },
        rest: ['--', '--help', '-v', 'argument'],
    });

    expect(parse([undefined as unknown as string, 'command'])).toEqual({
        args: { ...defaults(), command: 'command' },
        rest: [],
    });
});

Deno.test('Cr::parseArguments expands grouped short options', () => {
    expect(parse(['-vh', 'command'])).toEqual({
        args: {
            ...defaults(),
            help: true,
            verbose: true,
            quiet: false,
        },
        rest: [],
    });

    expectUsageError(['-vx', 'command'], 'Unknown option "-x".');
});

Deno.test('Cr::parseArguments rejects invalid global option values', () => {
    for (
        const [args, message] of [
            [['--help=value'], 'Option "--help" does not take a value.'],
            [['--version=value'], 'Option "--version" does not take a value.'],
            [['--non-interactive=value'], 'Option "--non-interactive" does not take a value.'],
            [['--no-color=value'], 'Option "--no-color" does not take a value.'],
            [['--verbose=value'], 'Option "--verbose" does not take a value.'],
            [['--quiet=value'], 'Option "--quiet" does not take a value.'],
            [['--cwd'], 'Option "--cwd" requires a value.'],
            [['--cwd', '-v'], 'Option "--cwd" requires a value.'],
        ] as const
    ) {
        expectUsageError(args, message);
    }
});

Deno.test('Cr::parseArguments rejects unknown options before the command', () => {
    for (
        const [args, message] of [
            [['--unknown', 'command'], 'Unknown option "--unknown".'],
            [['-x', 'command'], 'Unknown option "-x".'],
            [['-xv', 'command'], 'Unknown option "-x".'],
        ] as const
    ) {
        expectUsageError(args, message);
    }
});

Deno.test('Cr::parseArguments rejects verbose and quiet together', () => {
    for (
        const [args, message] of [
            [
                ['--verbose', '--quiet'],
                'Cannot use "--quiet" when "--verbose" is enabled.',
            ],
            [
                ['--quiet', '--verbose'],
                'Cannot use "--verbose" when "--quiet" is enabled.',
            ],
            [
                ['-v', '-q'],
                'Cannot use "--quiet" when "--verbose" is enabled.',
            ],
            [
                ['-q', '-v'],
                'Cannot use "--verbose" when "--quiet" is enabled.',
            ],
            [
                ['-vqh'],
                'Cannot use "--quiet" when "--verbose" is enabled.',
            ],
            [
                ['-qvh'],
                'Cannot use "--verbose" when "--quiet" is enabled.',
            ],
        ] as const
    ) {
        expectUsageError(args, message);
    }
});
