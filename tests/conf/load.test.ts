import { expect } from '@std/expect';
import { join } from '@std/path';
import { loadConfiguration } from '../../src/conf/load.ts';
import type { GlobalArguments } from '@commands';

const configurationEnvironmentVariables = [
    'DEFAULT_HARNESS',
    'LOG_LEVEL',
    'NO_COLOR',
    'NON_INTERACTIVE',
] as const;

function globalArguments(overrides: Partial<GlobalArguments> = {}): GlobalArguments {
    return {
        command: undefined,
        cwd: undefined,
        help: false,
        version: false,
        nonInteractive: false,
        noColor: false,
        verbose: false,
        quiet: false,
        ...overrides,
    };
}

type ConfigurationEnvironment = Partial<
    Record<(typeof configurationEnvironmentVariables)[number], string>
>;

async function withConfigurationEnvironment<T>(
    environment: ConfigurationEnvironment,
    callback: () => Promise<T>,
): Promise<T> {
    const original = new Map(
        configurationEnvironmentVariables.map((name) => [name, Deno.env.get(name)]),
    );
    for (const name of configurationEnvironmentVariables) Deno.env.delete(name);
    for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);

    try {
        return await callback();
    } finally {
        for (const name of configurationEnvironmentVariables) {
            const value = original.get(name);
            if (value === undefined) Deno.env.delete(name);
            else Deno.env.set(name, value);
        }
    }
}

async function read(
    local: string,
    global?: string,
    arguments_: Partial<GlobalArguments> = {},
    environment: ConfigurationEnvironment = {},
): ReturnType<typeof loadConfiguration> {
    const root = await Deno.makeTempDir();
    const installRoot = join(root, 'install');
    const repositoryRoot = join(root, 'repository');

    try {
        await Deno.mkdir(join(repositoryRoot, '.coderail'), { recursive: true });
        if (global !== undefined) {
            await Deno.mkdir(installRoot, { recursive: true });
            await Deno.writeTextFile(join(installRoot, 'coderail.conf'), global);
        }
        await Deno.writeTextFile(join(repositoryRoot, '.coderail', 'coderail.conf'), local);

        return await withConfigurationEnvironment(environment, () =>
            loadConfiguration(
                { currentWorkingDirectory: root, installRoot, repositoryRoot },
                globalArguments(arguments_),
            ));
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

async function readWithoutRepository(
    arguments_: Partial<GlobalArguments> = {},
    environment: ConfigurationEnvironment = {},
): ReturnType<typeof loadConfiguration> {
    const root = await Deno.makeTempDir();

    try {
        return await withConfigurationEnvironment(environment, () =>
            loadConfiguration(
                { currentWorkingDirectory: root, installRoot: root },
                globalArguments(arguments_),
            ));
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

async function errors(text: string): Promise<Error[]> {
    try {
        await read(text);
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('coderail.conf');
        let cause: unknown = error;
        while (cause instanceof Error) cause = cause.cause;
        expect(Array.isArray(cause)).toBe(true);
        return cause as Error[];
    }
    throw new Error('Expected configuration validation to fail');
}

Deno.test({
    name:
        'Conf::loadConfiguration accepts partial configuration and merges valid verification rules',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        expect(await read('')).toEqual({
            defaultHarness: undefined,
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: [],
        });
        expect(
            await read(
                `default_harness = "codex"
log_level = "quiet"
no_color = true
non_interactive = false
[[verify]]
pattern = "*.ts"
commands = [["deno", "check"], []]
requires = ["deno"]
`,
                `log_level = "verbose"
non_interactive = true
[[verify]]
pattern = "*.js"
commands = []
`,
            ),
        ).toEqual({
            defaultHarness: 'codex',
            logLevel: 'quiet',
            noColor: true,
            nonInteractive: false,
            verify: [
                { pattern: '*.js', commands: [] },
                { pattern: '*.ts', commands: [['deno', 'check'], []], requires: ['deno'] },
            ],
        });
    },
});

Deno.test({
    name:
        'Conf::loadConfiguration gives command-line overrides precedence over environment and files',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        expect(
            await read(
                'log_level = "quiet"\nno_color = false\nnon_interactive = false',
                undefined,
                {
                    verbose: true,
                    noColor: true,
                    nonInteractive: true,
                },
                {
                    LOG_LEVEL: 'normal',
                    NO_COLOR: 'false',
                    NON_INTERACTIVE: 'false',
                },
            ),
        ).toMatchObject({
            logLevel: 'verbose',
            noColor: true,
            nonInteractive: true,
        });
    },
});

Deno.test({
    name: 'Conf::loadConfiguration reads environment defaults and supports non-repository commands',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        expect(
            await read('', undefined, {}, {
                DEFAULT_HARNESS: 'environment-harness',
                LOG_LEVEL: 'quiet',
                NO_COLOR: '1',
                NON_INTERACTIVE: 'true',
            }),
        ).toMatchObject({
            defaultHarness: 'environment-harness',
            logLevel: 'quiet',
            noColor: true,
            nonInteractive: true,
        });
        expect(
            await readWithoutRepository({ quiet: true }, { LOG_LEVEL: 'verbose' }),
        ).toMatchObject({ logLevel: 'quiet' });
    },
});

Deno.test({
    name: 'Conf::loadConfiguration rejects invalid environment overrides',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        try {
            await read('', undefined, {}, { LOG_LEVEL: 'debug' });
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Invalid environment variable overrides');
            return;
        }
        throw new Error('Expected invalid environment override to fail');
    },
});

Deno.test({
    name: 'Conf::loadConfiguration rejects invalid types and unknown properties',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        for (
            const text of [
                'default_harness = null',
                'default_harness = 1',
                'log_level = "debug"',
                'log_level = false',
                'no_color = "true"',
                'non_interactive = 0',
                'verify = null',
                '[verify]',
                'verify = [null, false, "rule", []]',
                'unknown = true',
                '__proto__ = true',
                '[[verify]]\npattern = false\ncommands = []',
                '[[verify]]\npattern = "*"\ncommands = false',
                '[[verify]]\npattern = "*"\ncommands = ["deno"]',
                '[[verify]]\npattern = "*"\ncommands = [[null, ["deno"]]]',
                '[[verify]]\npattern = "*"\ncommands = []\nrequires = true',
                '[[verify]]\npattern = "*"\ncommands = []\nrequires = [1]',
                '[[verify]]\npattern = "*"\ncommands = []\nunknown = true',
                '[[verify]]',
            ]
        ) {
            expect((await errors(text)).length, text).toBeGreaterThan(0);
        }
    },
});

Deno.test({
    name: 'Conf::loadConfiguration accumulates errors with property paths and source locations',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        const failures = await errors(`no_color = 1
unknown = true
[[verify]]
pattern = false
commands = [["deno", 2], [null]]
requires = [false]
extra = 0
[[verify]]
requires = []
`);
        expect(failures.map((error) => error.message)).toEqual([
            'no_color: Expected a boolean at line 1, column 12',
            'unknown: Unknown property at line 2, column 1',
            'verify.0.pattern: Expected a string at line 4, column 11',
            'verify.0.commands.0.1: Expected a string at line 5, column 22',
            'verify.0.commands.1.0: Expected a string at line 5, column 27',
            'verify.0.requires.0: Expected a string at line 6, column 13',
            'verify.0.extra: Unknown property at line 7, column 1',
            'verify.1.pattern: Missing required property "pattern"',
            'verify.1.commands: Missing required property "commands"',
        ]);
    },
});
