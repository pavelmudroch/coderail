import type { GlobalArguments } from '@commands';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { loadConfiguration } from '../../src/conf/load-configuration.ts';

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
    for (const name of configurationEnvironmentVariables) {
        Deno.env.delete(name);
    }
    for (const [name, value] of Object.entries(environment)) {
        Deno.env.set(name, value);
    }

    try {
        return await callback();
    } finally {
        for (const name of configurationEnvironmentVariables) {
            const value = original.get(name);
            if (value === undefined) {
                Deno.env.delete(name);
            } else {
                Deno.env.set(name, value);
            }
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
            ),
        );
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
            ),
        );
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
        while (cause instanceof Error) {
            cause = cause.cause;
        }
        expect(Array.isArray(cause)).toBe(true);
        return cause as Error[];
    }
    throw new Error('Expected configuration validation to fail');
}

Deno.test({
    name: 'Conf::loadConfiguration accepts partial configuration and merges valid verification rules',
    permissions: { env: true, read: true, write: true },
    fn: async () => {
        expect(await read('')).toEqual({
            defaultHarness: undefined,
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: { rules: [] },
        });
        expect(
            await read(
                `default_harness = "codex"
log_level = "quiet"
no_color = true
non_interactive = false
[[verify.rules]]
pattern = "*.ts"
commands = [["deno", "check"], []]
requires = ["deno"]
`,
                `log_level = "verbose"
non_interactive = true
[[verify.rules]]
pattern = "*.js"
commands = []
`,
            ),
        ).toEqual({
            defaultHarness: 'codex',
            logLevel: 'quiet',
            noColor: true,
            nonInteractive: false,
            verify: {
                rules: [
                    { pattern: '*.js', commands: [] },
                    { pattern: '*.ts', commands: [['deno', 'check'], []], requires: ['deno'] },
                ],
            },
        });
    },
});

Deno.test({
    name: 'Conf::loadConfiguration gives command-line overrides precedence over environment and files',
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
            await read(
                '',
                undefined,
                {},
                {
                    DEFAULT_HARNESS: 'environment-harness',
                    LOG_LEVEL: 'quiet',
                    NO_COLOR: '1',
                    NON_INTERACTIVE: 'true',
                },
            ),
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
        for (const text of [
            'default_harness = null',
            'default_harness = 1',
            'log_level = "debug"',
            'log_level = false',
            'no_color = "true"',
            'non_interactive = 0',
            'verify = null',
            '[[verify]]',
            'verify = [null, false, "rule", []]',
            'unknown = true',
            '__proto__ = true',
            '[[verify.rules]]\npattern = false\ncommands = []',
            '[[verify.rules]]\npattern = "*"\ncommands = false',
            '[[verify.rules]]\npattern = "*"\ncommands = ["deno"]',
            '[[verify.rules]]\npattern = "*"\ncommands = [[null, ["deno"]]]',
            '[[verify.rules]]\npattern = "*"\ncommands = []\nrequires = true',
            '[[verify.rules]]\npattern = "*"\ncommands = []\nrequires = [1]',
            '[[verify.rules]]\npattern = "*"\ncommands = []\nunknown = true',
            '[[verify.rules]]',
        ]) {
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
[[verify.rules]]
pattern = false
commands = [["deno", 2], [null]]
requires = [false]
extra = 0
[[verify.rules]]
requires = []
`);
        expect(failures.map((error) => error.message)).toEqual([
            'no_color: Expected a boolean at line 1, column 12',
            'unknown: Unknown property at line 2, column 1',
            'verify.rules.0.pattern: Expected a string at line 4, column 11',
            'verify.rules.0.commands.0.1: Expected a string at line 5, column 22',
            'verify.rules.0.commands.1.0: Expected a string at line 5, column 27',
            'verify.rules.0.requires.0: Expected a string at line 6, column 13',
            'verify.rules.0.extra: Unknown property at line 7, column 1',
            'verify.rules.1.pattern: Missing required property "pattern"',
            'verify.rules.1.commands: Missing required property "commands"',
        ]);
    },
});

Deno.test('Conf::loadConfiguration validates and merges global actions independently', async () => {
    expect(
        (
            await read(
                '[verify]\npre = [["local"]]\npost = [["clean"]]',
                '[verify]\npre = [\n ["global"],\n []\n]\npost = [["first"]]',
            )
        ).verify,
    ).toEqual({
        rules: [],
        pre: [['global'], [], ['local']],
        post: [['first'], ['clean']],
    });
    expect((await read('[verify]', '[verify]\npre = [["global"]]')).verify).toEqual({
        rules: [],
        pre: [['global']],
    });
    for (const text of [
        '[verify]\nrules = [null]',
        '[verify]\npre = false',
        '[verify]\npost = ["bad"]',
        '[verify]\npre = [[1]]',
        '[verify]\nunknown = []',
    ]) {
        expect((await errors(text)).length).toBeGreaterThan(0);
    }
    expect((await errors('[verify]\npre = [[1]]'))[0]?.message).toBe(
        'verify.pre.0.0: Expected a string at line 2, column 9',
    );
});

Deno.test(
    'Conf::loadConfiguration accepts partial loop settings and preserves native strings',
    async () => {
        for (const harness of ['codex', 'claude']) {
            for (const [source, target] of [
                ['model', 'model'],
                ['effort', 'effort'],
                ['implement_model', 'implementModel'],
                ['implement_effort', 'implementEffort'],
                ['review_model', 'reviewModel'],
                ['review_effort', 'reviewEffort'],
                ['commit_model', 'commitModel'],
                ['commit_effort', 'commitEffort'],
            ] as const) {
                expect(
                    (await read(`[loop.${harness}]\n${source} = " native/value:Custom "`)).loop,
                ).toEqual({ [harness]: { [target]: ' native/value:Custom ' } });
            }
        }
        expect((await read('[loop]')).loop).toEqual({});
        expect((await read('[loop.codex]\n[loop.claude]')).loop).toEqual({ codex: {}, claude: {} });
    },
);

Deno.test(
    'Conf::loadConfiguration merges loop settings by harness and individual key',
    async () => {
        expect(
            (
                await read(
                    `[loop.codex]
model = "project-model"
review_effort = "project-review"
[loop.claude]
commit_model = "project-commit"
`,
                    `[loop.codex]
model = "global-model"
effort = "global-effort"
implement_model = "global-implement"
review_effort = "global-review"
[loop.claude]
model = "global-claude"
commit_effort = "global-commit"
`,
                )
            ).loop,
        ).toEqual({
            codex: {
                model: 'project-model',
                effort: 'global-effort',
                implementModel: 'global-implement',
                reviewEffort: 'project-review',
            },
            claude: {
                model: 'global-claude',
                commitModel: 'project-commit',
                commitEffort: 'global-commit',
            },
        });
        for (const local of ['', '[loop]', '[loop.codex]', '[loop.claude]']) {
            expect((await read(local, '[loop.codex]\ncommit_model = "saved"')).loop?.codex).toEqual(
                { commitModel: 'saved' },
            );
        }
    },
);

Deno.test(
    'Conf::loadConfiguration rejects invalid loop sections and settings with locations',
    async () => {
        for (const section of ['loop', 'loop.codex', 'loop.claude']) {
            const prefix = section === 'loop' ? '' : '[loop]\n';
            const key = section.split('.').at(-1);
            for (const value of ['null', 'true', '1', '"text"', '[]']) {
                const failures = await errors(`${prefix}${key} = ${value}`);
                expect(failures[0]?.message).toContain(`${section}: Expected an object at line`);
            }
            expect((await errors(`[[${section}]]`))[0]?.message).toContain(
                `${section}: Expected an object at line`,
            );
        }
        for (const harness of ['codex', 'claude']) {
            for (const key of [
                'model',
                'effort',
                'implement_model',
                'implement_effort',
                'review_model',
                'review_effort',
                'commit_model',
                'commit_effort',
            ]) {
                for (const value of ['null', 'false', '1', '[]', '""', '"  "']) {
                    expect((await errors(`[loop.${harness}]\n${key} = ${value}`))[0]?.message).toBe(
                        `loop.${harness}.${key}: Expected a nonblank string at line 2, column ${key.length + 4}`,
                    );
                }
                expect((await errors(`[loop.${harness}.${key}]`))[0]?.message).toContain(
                    `loop.${harness}.${key}: Expected a nonblank string at line`,
                );
            }
            expect((await errors(`[loop.${harness}]\nunknown = "x"`))[0]?.message).toBe(
                `loop.${harness}.unknown: Unknown property at line 2, column 1`,
            );
        }
        expect((await errors('[loop.other]'))[0]?.message).toBe(
            'loop.other: Unknown property at line 1, column 7',
        );
    },
);
