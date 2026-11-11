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
            await Deno.writeTextFile(join(installRoot, 'config'), global);
        }
        await Deno.writeTextFile(join(repositoryRoot, '.coderail', 'config'), local);

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
        expect((error as Error).message).toContain(join('.coderail', 'config'));
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

Deno.test(
    'Conf diagnostics validate independent sources and discard all partial settings on failure',
    async () => {
        const { diagnoseConfiguration } = await import('../../src/conf/load-configuration.ts');
        const root = await Deno.makeTempDir();
        const project = join(root, 'project');
        const global = globalArguments({
            verbose: true,
            noColor: true,
            nonInteractive: true,
            cwd: project,
        });
        try {
            await Deno.mkdir(join(project, '.coderail'), { recursive: true });
            await Deno.writeTextFile(
                join(root, 'config'),
                'default_harness = "saved"\n[[verify.rules]]\npattern = "*"\ncommands = []',
            );
            await Deno.writeTextFile(join(project, '.coderail', 'config'), 'log_level = "quiet"');
            const context = { installRoot: root, repositoryRoots: [project] };
            await withConfigurationEnvironment({}, async () => {
                expect(
                    (await diagnoseConfiguration(context, global)).configuration.defaultHarness,
                ).toBe('saved');
            });
            await withConfigurationEnvironment({ LOG_LEVEL: 'bad' }, async () => {
                const result = await diagnoseConfiguration(context, global);
                expect(result.errors).toHaveLength(1);
                expect(result.configuration.defaultHarness).toBeUndefined();
                expect(result.configuration.verify.rules).toEqual([]);
                expect(result.configuration.logLevel).toBe('verbose');
            });
            await Deno.writeTextFile(join(project, '.coderail', 'config'), 'unknown = true');
            await withConfigurationEnvironment({ LOG_LEVEL: 'bad' }, async () => {
                const result = await diagnoseConfiguration(context, global);
                expect(result.errors).toHaveLength(2);
                expect(result.configuration).toMatchObject({
                    defaultHarness: undefined,
                    logLevel: 'verbose',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                });
            });
            await Deno.writeTextFile(join(root, 'config'), 'unknown = true');
            await withConfigurationEnvironment({ LOG_LEVEL: 'bad' }, async () => {
                expect((await diagnoseConfiguration(context, global)).errors).toHaveLength(3);
            });
            await Deno.remove(join(root, 'config'));
            await Deno.writeTextFile(join(project, '.coderail', 'config'), '');
            await withConfigurationEnvironment({}, async () => {
                expect((await diagnoseConfiguration(context, global)).errors).toEqual([]);
            });
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Conf diagnostics handle unavailable paths, read errors, fresh defaults and cancellation',
    async () => {
        const { createConfiguration, diagnoseConfiguration } =
            await import('../../src/conf/load-configuration.ts');
        const root = await Deno.makeTempDir();
        const open = Deno.open;
        const env = Deno.env.get;
        const controller = new AbortController();
        try {
            await withConfigurationEnvironment({}, async () => {
                expect(
                    (await diagnoseConfiguration({ repositoryRoots: [] }, globalArguments()))
                        .errors,
                ).toEqual([]);
                expect(
                    (
                        await diagnoseConfiguration(
                            { repositoryRoots: [root] },
                            globalArguments(),
                            controller.signal,
                        )
                    ).errors,
                ).toEqual([]);
                await Deno.writeTextFile(join(root, 'config'), '');
                await Deno.mkdir(join(root, '.coderail'));
                await Deno.writeTextFile(join(root, '.coderail', 'config'), '');
                Deno.open = () => Promise.reject(new Deno.errors.PermissionDenied('unreadable'));
                const result = await diagnoseConfiguration(
                    { installRoot: root, repositoryRoots: [root] },
                    globalArguments({ quiet: true }),
                    controller.signal,
                );
                expect(result.errors).toHaveLength(2);
                expect(result.configuration.logLevel).toBe('quiet');
                Deno.env.get = () => {
                    throw new Deno.errors.PermissionDenied('environment');
                };
                expect(
                    (
                        await diagnoseConfiguration(
                            { repositoryRoots: [] },
                            globalArguments(),
                            controller.signal,
                        )
                    ).errors,
                ).toHaveLength(1);
                Deno.env.get = env;
                Deno.open = () => {
                    controller.abort(new Error('cancelled while reading'));
                    return Promise.reject(new Deno.errors.PermissionDenied());
                };
                await expect(
                    diagnoseConfiguration(
                        { installRoot: root, repositoryRoots: [] },
                        globalArguments(),
                        controller.signal,
                    ),
                ).rejects.toThrow('cancelled while reading');
            });
            const first = createConfiguration();
            first.verify.rules.push({ pattern: '*', commands: [] });
            expect(createConfiguration().verify.rules).toEqual([]);
        } finally {
            Deno.open = open;
            Deno.env.get = env;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Conf diagnostics validate source repository settings without merging them into another project',
    async () => {
        const { diagnoseConfiguration } = await import('../../src/conf/load-configuration.ts');
        const root = await Deno.makeTempDir();
        try {
            await Deno.mkdir(join(root, '.coderail'));
            await Deno.writeTextFile(
                join(root, '.coderail', 'config'),
                'default_harness = "source-only"',
            );
            await withConfigurationEnvironment({}, async () => {
                const context = { repositoryRoots: [], validationRoots: [root] };
                expect(
                    (await diagnoseConfiguration(context, globalArguments())).configuration
                        .defaultHarness,
                ).toBeUndefined();
                expect(
                    (
                        await diagnoseConfiguration(
                            { repositoryRoots: [root], validationRoots: [root] },
                            globalArguments(),
                        )
                    ).configuration.defaultHarness,
                ).toBe('source-only');
                await Deno.remove(join(root, '.coderail', 'config'));
                expect((await diagnoseConfiguration(context, globalArguments())).errors).toEqual(
                    [],
                );
                await Deno.writeTextFile(join(root, '.coderail', 'config'), 'unknown = true');
                expect(
                    (await diagnoseConfiguration(context, globalArguments())).errors,
                ).toHaveLength(1);
            });
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Conf diagnostics reject unsupported sources before opening and preserve regular symlinks',
    async () => {
        const { diagnoseConfiguration } = await import('../../src/conf/load-configuration.ts');
        const root = await Deno.makeTempDir();
        const open = Deno.open;
        const stat = Deno.stat;
        try {
            const source = join(root, 'source');
            const project = join(root, 'project');
            await Deno.mkdir(join(source, '.coderail'), { recursive: true });
            await Deno.mkdir(join(project, '.coderail'), { recursive: true });
            const paths = [
                join(root, 'config'),
                join(source, '.coderail', 'config'),
                join(project, '.coderail', 'config'),
            ];
            for (const path of paths) {
                await Deno.writeTextFile(path, 'log_level = "quiet"');
            }
            const info = await stat(join(root, 'config'));
            await withConfigurationEnvironment({ LOG_LEVEL: 'bad' }, async () => {
                Deno.stat = () => Promise.resolve({ ...info, isFile: false, isFifo: true });
                Deno.open = () => {
                    throw new Error('must not open unsupported input');
                };
                const result = await diagnoseConfiguration(
                    { installRoot: root, validationRoots: [source], repositoryRoots: [project] },
                    globalArguments({ verbose: true }),
                );
                expect(result.errors).toHaveLength(4);
                for (const [index, path] of paths.entries()) {
                    expect(result.errors[index]?.message).toContain(path);
                    expect(result.errors[index]?.message).toContain('expected a regular file');
                }
                expect(result.configuration.logLevel).toBe('verbose');
            });
            Deno.stat = () => Promise.reject(new Deno.errors.PermissionDenied('stat denied'));
            expect(
                (
                    await diagnoseConfiguration(
                        { installRoot: root, repositoryRoots: [] },
                        globalArguments(),
                    )
                ).errors[0]?.message,
            ).toContain('stat denied');
            Deno.stat = stat;
            Deno.open = () => Promise.reject(new Deno.errors.NotFound());
            await withConfigurationEnvironment({}, async () => {
                expect(
                    (
                        await diagnoseConfiguration(
                            { installRoot: root, repositoryRoots: [] },
                            globalArguments(),
                        )
                    ).errors,
                ).toEqual([]);
            });
            Deno.open = open;
            for (const path of paths) {
                await Deno.rename(path, `${path}.real`);
                await Deno.symlink(`${path}.real`, path);
            }
            await withConfigurationEnvironment({}, async () => {
                const result = await diagnoseConfiguration(
                    { installRoot: root, validationRoots: [source], repositoryRoots: [project] },
                    globalArguments(),
                );
                expect(result.errors).toEqual([]);
                expect(result.configuration.logLevel).toBe('quiet');
            });
        } finally {
            Deno.stat = stat;
            Deno.open = open;
            await Deno.remove(root, { recursive: true });
        }
    },
);
