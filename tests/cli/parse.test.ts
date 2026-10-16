import { expect } from '@std/expect';
import {
    type GlobalArguments,
    type ParsedArguments,
    parseGlobalArguments,
} from '../../src/cli/parse.ts';
import { UsageError } from '../../src/cli/usage-error.ts';

function parse(args: readonly string[]): ParsedArguments {
    return parseGlobalArguments(args);
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
        throw new Error('Expected parseGlobalArguments to throw.');
    } catch (error) {
        expect(error).toBeInstanceOf(UsageError);
        expect((error as Error).message).toBe(message);
        expect((error as UsageError).usage()).toContain('Usage:');
    }
}

Deno.test('Cli::parseGlobalArguments parses global options and commands', () => {
    expect(parse([])).toEqual({ global: defaults(), rest: [] });

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
        global: {
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
        global: {
            ...defaults(),
            help: true,
        },
        rest: [],
    });

    expect(parse(['--cwd=project', 'status'])).toEqual({
        global: { ...defaults(), command: 'status', cwd: 'project' },
        rest: [],
    });

    const cwdOptionWithoutValue = new String('--cwd=');
    cwdOptionWithoutValue.split = () => [];
    expect(parse([cwdOptionWithoutValue as unknown as string])).toEqual({
        global: { ...defaults(), cwd: './' },
        rest: [],
    });
});

Deno.test('Cli::parseGlobalArguments stops at global help and forwards command help', () => {
    for (const help of ['-h', '--help']) {
        expect(parse([help, '--unknown', 'command'])).toEqual({
            global: { ...defaults(), help: true },
            rest: [],
        });

        expect(parse(['command', help, 'argument'])).toEqual({
            global: { ...defaults(), command: 'command' },
            rest: [help, 'argument'],
        });
    }
});

Deno.test('Cli::parseGlobalArguments preserves command arguments and post-command options', () => {
    expect(parse(['command', '--unknown', '-x', '-', 'argument'])).toEqual({
        global: { ...defaults(), command: 'command' },
        rest: ['--unknown', '-x', '-', 'argument'],
    });

    expect(parse(['command', '-xy', 'argument'])).toEqual({
        global: { ...defaults(), command: 'command' },
        rest: ['-x', '-y', 'argument'],
    });

    expect(parse(['command', '--', '--help', '-v', 'argument'])).toEqual({
        global: { ...defaults(), command: 'command' },
        rest: ['--', '--help', '-v', 'argument'],
    });

    expect(parse([undefined as unknown as string, 'command'])).toEqual({
        global: { ...defaults(), command: 'command' },
        rest: [],
    });
});

Deno.test('Cli::parseGlobalArguments expands grouped short options', () => {
    expect(parse(['-vh', 'command'])).toEqual({
        global: {
            ...defaults(),
            help: true,
            verbose: true,
            quiet: false,
        },
        rest: [],
    });

    expectUsageError(['-vx', 'command'], 'Unknown option "-x".');
});

Deno.test('Cli::parseGlobalArguments rejects invalid global option values', () => {
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

Deno.test('Cli::parseGlobalArguments rejects unknown options before the command', () => {
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

Deno.test('Cli::parseGlobalArguments rejects verbose and quiet together', () => {
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
