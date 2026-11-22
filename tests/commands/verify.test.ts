import { Cli } from '@cli';
import type { Configuration } from '@conf';
import { Log } from '@log';
import { expect } from '@std/expect';

import { Verify } from '../../src/commands/verify.ts';

function verifyCli(root: string, args: string[], signal?: AbortSignal): Deno.Command {
    return new Deno.Command(Deno.execPath(), {
        args: [
            'run',
            '-A',
            '--config',
            new URL('../../deno.json', import.meta.url).pathname,
            new URL('../../src/main.ts', import.meta.url).pathname,
            '--cwd',
            root,
            '--no-color',
            ...args,
        ],
        stdout: 'piped',
        stderr: 'piped',
        env: { NO_COLOR: '1', LOG_LEVEL: 'normal' },
        signal,
    });
}

function cliText(text: string): string {
    return text.replaceAll('\x1b[0K', '');
}

Deno.test('Verify parses selection, flags, literal paths, and early help', () => {
    const command = new Verify();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([...new Array<string>(1), 'file']).args.paths).toEqual(['file']);
    for (const flag of ['-s', '--short']) {
        expect(command.parseArguments([flag, '--changed', 'src', '--', '--help'])).toEqual({
            args: { help: false, short: true, changed: true, dry: false, paths: ['src', '--help'] },
            rest: [],
        });
    }
    expect(command.shouldHandleHelp(command.parseArguments(['file']))).toBe(false);
    for (const help of ['-h', '--help']) {
        expect(command.shouldHandleHelp(command.parseArguments([help, '--unknown']))).toBe(true);
    }
    for (const args of [
        [],
        ['--'],
        ['--unknown'],
        ['-x'],
        ['--help=true'],
        ['--short=false'],
        ['--changed=true'],
        ['--dry=true'],
    ]) {
        try {
            command.parseArguments(args);
            throw new Error('Expected usage error');
        } catch (error) {
            expect(Cli.isUsageError(error)).toBe(true);
        }
    }
    expect(command.parseArguments(['--dry', 'a']).args.dry).toBe(true);
    expect(command.getUsage()).toContain('planned');
    expect(command.getUsage()).toContain('skipped');
});

async function fixture(
    test: (
        root: string,
        run: (
            args: string[],
            rules?: Configuration['verify']['rules'],
            signal?: AbortSignal,
            root?: string,
            actions?: Pick<Configuration['verify'], 'pre' | 'post'>,
        ) => Promise<void>,
        output: string[],
        info: string[],
    ) => Promise<void>,
): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const original = {
        output: Log.output,
        info: Log.info,
        level: Log.level,
        noColor: Log.noColor,
        exitCode: Deno.exitCode,
    };
    Log.level = 'normal';
    Log.noColor = false;
    const output: string[] = [];
    const info: string[] = [];
    Log.output = (...messages) => {
        output.push(messages.join(' '));
    };
    Log.info = (...messages) => {
        info.push(messages.join(' '));
    };
    Deno.exitCode = 0;
    const command = new Verify();
    try {
        await Deno.writeTextFile(`${root}/a`, '');
        await Deno.writeTextFile(`${root}/b`, '');
        await Deno.mkdir(`${root}/empty`);
        await test(
            root,
            (
                args,
                rules = [],
                signal = new AbortController().signal,
                repositoryRoot = root,
                actions = {},
            ) =>
                command.run({
                    context: { repositoryRoot, currentWorkingDirectory: root, installRoot: root },
                    configuration: {
                        verify: { rules, ...actions },
                        logLevel: 'normal',
                        noColor: true,
                        nonInteractive: true,
                    },
                    parsedArguments: command.parseArguments(args),
                    signal,
                }),
            output,
            info,
        );
    } finally {
        Log.output = original.output;
        Log.info = original.info;
        Log.level = original.level;
        Log.noColor = original.noColor;
        Deno.exitCode = original.exitCode;
        await Deno.remove(root, { recursive: true });
    }
}

Deno.test(
    'Verify reports JSON commands and live output, summarizes short runs, and reports failures',
    async () => {
        await fixture(async (root, run, output, info) => {
            const command = [
                Deno.execPath(),
                'eval',
                "console.log('out'); console.error('err'); Deno.writeTextFileSync('marker', 'x', {append:true});",
            ];
            await run(['a', 'b'], [{ pattern: '*', commands: [command] }]);
            expect(output).toEqual([
                `a ${Log.color.green('ok')}`,
                `  ${JSON.stringify(command)} ${Log.color.green('ok')}`,
                `b ${Log.color.green('ok')}`,
                `  ${JSON.stringify(command)} ${Log.color.green('ok')}`,
            ]);
            expect(info[0]).toBe(JSON.stringify(command));
            expect(info.slice(1).sort()).toEqual(['err', 'out']);
            expect(await Deno.readTextFile(`${root}/marker`)).toBe('x');
            output.length = info.length = 0;
            const silent = [Deno.execPath(), 'eval', ''];
            await run(['a'], [{ pattern: '*', commands: [silent] }]);
            expect(info).toEqual([JSON.stringify(silent)]);
            output.length = info.length = 0;
            await run(
                ['-s', 'a'],
                [
                    {
                        pattern: '*',
                        commands: [[Deno.execPath(), 'eval', 'Deno.exit(1)']],
                    },
                ],
            );
            expect(output).toEqual([`a ${Log.color.red('fail')}`]);
            expect(info).toEqual([]);
            expect(Deno.exitCode).toBe(1);
            output.length = 0;
            const failure = [Deno.execPath(), 'eval', 'Deno.exit(1)'];
            await run(['a'], [{ pattern: '*', commands: [failure] }]);
            expect(output).toEqual([
                `a ${Log.color.red('fail')}`,
                `  ${JSON.stringify(failure)} ${Log.color.red('fail')}`,
            ]);
            Log.noColor = true;
            output.length = 0;
            await run(['a'], [{ pattern: '*', commands: [failure] }]);
            expect(output).toEqual(['a fail', `  ${JSON.stringify(failure)} fail`]);
        });
    },
);

Deno.test('Verify reports no tests after skipped files or empty selections', async () => {
    await fixture(async (_root, run, output, info) => {
        for (const rules of [
            [],
            [{ pattern: 'other', commands: [['unused']] }],
            [
                {
                    pattern: '*',
                    requires: ['missing'],
                    commands: [['unused']],
                },
            ],
            [{ pattern: '*', commands: [[], []] }],
        ]) {
            for (const flags of [[], ['-s'], ['--dry'], ['--dry', '-s']]) {
                output.length = 0;
                await run([...flags, 'a'], rules);
                expect(output).toEqual([`a ${Log.color.yellow('skipped')}`, 'No tests found']);
            }
        }
        output.length = 0;
        await run(['empty']);
        expect(output).toEqual(['No tests found']);
        expect(info).toEqual([]);
        expect(Deno.exitCode).toBe(0);
    });
});

Deno.test(
    'Verify validates all rules and paths before executing and propagates invocation errors',
    async () => {
        await fixture(async (root, run, output) => {
            const rule = {
                pattern: '*',
                commands: [[Deno.execPath(), 'eval', "Deno.writeTextFileSync('marker', '')"]],
            };
            await expect(run(['a'], [rule, { pattern: '${bad', commands: [] }])).rejects.toThrow();
            await expect(run(['a', 'missing'], [rule])).rejects.toThrow();
            await expect(Deno.stat(`${root}/marker`)).rejects.toThrow();
            await expect(run(['a'], [], undefined, '')).rejects.toThrow();
            await expect(run(['--changed'])).rejects.toThrow();
            const controller = new AbortController();
            controller.abort(new Error('cancelled'));
            Deno.exitCode = 3;
            await expect(run(['a'], [], controller.signal)).rejects.toThrow('cancelled');
            expect(Deno.exitCode).toBe(3);
            expect(output).toEqual([]);
        });
    },
);

Deno.test(
    'Verify runtime supports help outside projects, initialization, cwd, quiet, and changed selection',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        async function invoke(
            ...args: string[]
        ): Promise<{ code: number; stdout: string; stderr: string }> {
            const result = await verifyCli(root, args).output();
            return {
                code: result.code,
                stdout: cliText(new TextDecoder().decode(result.stdout)),
                stderr: new TextDecoder().decode(result.stderr),
            };
        }
        try {
            for (const help of ['-h', '--help']) {
                const result = await invoke('verify', help);
                expect(result.code).toBe(0);
                expect(result.stdout).toContain('cr verify');
            }
            const missing = await invoke('verify', '.');
            expect(missing.code).toBe(1);
            expect(missing.stderr).toContain('cr init');
            expect((await invoke('init')).code).toBe(0);
            await Deno.writeTextFile(`${root}/a`, '');
            expect((await invoke('verify', 'a')).stdout).toContain('a skipped\nNo tests found');
            await new Deno.Command('git', { args: ['init', '-q', root] }).output();
            await new Deno.Command('git', { args: ['-C', root, 'add', '.'] }).output();
            const changed = await invoke('--quiet', 'verify', '--changed');
            expect(changed.code).toBe(0);
            expect(changed.stdout).toContain('a skipped');
            await new Deno.Command('git', {
                args: [
                    '-C',
                    root,
                    '-c',
                    'user.name=Test',
                    '-c',
                    'commit.gpgsign=false',
                    '-c',
                    'user.email=test@example.com',
                    'commit',
                    '-qm',
                    'fixture',
                ],
            }).output();
            for (const flags of [[], ['--short'], ['--quiet']]) {
                const result = await invoke('verify', '--changed', ...flags);
                expect(result.code).toBe(0);
                expect(result.stdout).toBe('No tests found\n');
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Verify streams both pipes before a default check exits and reports hook and reused statuses',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        try {
            expect((await verifyCli(root, ['init']).output()).code).toBe(0);
            await Deno.writeTextFile(`${root}/a.txt`, '');
            await Deno.writeTextFile(`${root}/b.txt`, '');
            const check = [
                Deno.execPath(),
                'eval',
                `console.log('child out');
console.error('child err');
const deadline = Date.now() + 3000;
while (!(await Deno.stat('release').catch(() => null))) {
    if (Date.now() >= deadline) Deno.exit(2);
    await new Promise(resolve => setTimeout(resolve, 10));
}`,
                'txt',
            ];
            const pre = [Deno.execPath(), 'eval', "console.log('pre output')"];
            const post = [Deno.execPath(), 'eval', "console.error('post output')"];
            await Deno.writeTextFile(
                `${root}/.coderail/config`,
                `[verify]
pre = [${JSON.stringify(pre)}]
post = [${JSON.stringify(post)}]
[[verify.rules]]
pattern = "${'${file:*}.${extension:*}'}"
commands = [${JSON.stringify([...check.slice(0, -1), '${extension}'])}]
`,
            );
            const controller = new AbortController();
            const child = verifyCli(
                root,
                ['verify', 'a.txt', 'b.txt'],
                AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
            ).spawn();
            const stdout = new Response(child.stdout).text();
            const status = child.status;
            let released = false;
            const stderr = (async () => {
                let text = '';
                for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
                    text += cliText(chunk);
                    if (
                        !released &&
                        text.includes('\nchild out\n') &&
                        text.includes('\nchild err\n')
                    ) {
                        await Deno.writeTextFile(`${root}/release`, '');
                        released = true;
                    }
                }
                return text;
            })();
            try {
                const [out, err, exit] = await Promise.all([stdout, stderr, status]);
                if (!exit.success) {
                    throw new Error(`Verification exited with ${exit.code}:\n${out}\n${err}`);
                }
                expect(released).toBe(true);
                expect(cliText(out).trimEnd().split('\n')).toEqual([
                    'Preparation ok',
                    `  ${JSON.stringify(pre)} ok`,
                    'a.txt ok',
                    `  ${JSON.stringify(check)} ok`,
                    'b.txt ok',
                    `  ${JSON.stringify(check)} ok`,
                    'Cleanup ok',
                    `  ${JSON.stringify(post)} ok`,
                ]);
                const lines = err.split('\n').filter((line) => line && !line.startsWith('notice:'));
                expect(lines).toEqual([
                    JSON.stringify(pre),
                    'pre output',
                    JSON.stringify(check),
                    ...lines.slice(3, 5),
                    JSON.stringify(post),
                    'post output',
                ]);
                expect(lines.slice(3, 5).sort()).toEqual(['child err', 'child out']);
            } finally {
                controller.abort();
                await Promise.allSettled([stdout, stderr, status]);
            }

            for (const mode of [
                { global: ['--quiet'], flags: [], file: 'ok' },
                { global: [], flags: ['--short'], file: 'ok' },
                { global: ['--verbose'], flags: ['--short'], file: 'ok' },
                { global: ['--verbose'], flags: ['--dry'], file: 'planned' },
            ]) {
                if (mode.file === 'planned') {
                    await Deno.remove(`${root}/release`);
                }
                const result = await verifyCli(root, [
                    ...mode.global,
                    'verify',
                    ...mode.flags,
                    'a.txt',
                    'b.txt',
                ]).output();
                const decoder = new TextDecoder();
                const out = cliText(decoder.decode(result.stdout));
                const err = cliText(decoder.decode(result.stderr));
                expect(result.code).toBe(0);
                expect(out).toContain(`a.txt ${mode.file}\n`);
                expect(out).toContain(`b.txt ${mode.file}\n`);
                for (const command of [pre, check, post]) {
                    expect(err).not.toContain(JSON.stringify(command));
                }
                const markers = err
                    .split('\n')
                    .filter((line) =>
                        ['pre output', 'child out', 'child err', 'post output'].includes(line),
                    );
                expect(markers).toEqual([]);
                if (mode.flags.includes('--short')) {
                    expect(out).toBe('a.txt ok\nb.txt ok\n');
                } else {
                    expect(out.match(new RegExp(` ${mode.file}\\n`, 'g'))).toHaveLength(8);
                }
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'Verify runs global actions once, independently of reuse, and prepares dependencies',
    async () => {
        await fixture(async (root, run) => {
            const append = [
                Deno.execPath(),
                'eval',
                "Deno.writeTextFileSync('order', 'x', {append:true})",
            ];
            await run(
                ['a', 'b'],
                [
                    { pattern: '*', commands: [append], requires: ['ready'] },
                    { pattern: '*', commands: [append] },
                ],
                undefined,
                root,
                {
                    pre: [
                        [],
                        append,
                        [Deno.execPath(), 'eval', "Deno.writeTextFileSync('ready', '')"],
                    ],
                    post: [append, [], append],
                },
            );
            expect(await Deno.readTextFile(`${root}/order`)).toBe('xxxx');
            expect(Deno.exitCode).toBe(0);
        });
    },
);

Deno.test(
    'Verify cleanup follows preparation and verification failures and attempts every cleanup',
    async () => {
        for (const short of [false, true]) {
            for (const phase of ['pre', 'verify', 'post', 'launch'] as const) {
                await fixture(async (root, run, output) => {
                    const mark = (text: string): string[] => [
                        Deno.execPath(),
                        'eval',
                        `Deno.writeTextFileSync('order', '${text}', {append:true})`,
                    ];
                    const fail = [Deno.execPath(), 'eval', 'Deno.exit(1)'];
                    await run(
                        [...(short ? ['-s'] : []), 'a'],
                        [
                            {
                                pattern: '*',
                                commands: phase === 'verify' ? [fail] : [mark('v')],
                            },
                        ],
                        undefined,
                        root,
                        {
                            pre: [
                                mark('p'),
                                ...(phase === 'pre'
                                    ? [fail, mark('unreachable')]
                                    : phase === 'launch'
                                      ? [['/missing-coderail-command']]
                                      : []),
                            ],
                            post: [fail, ['/missing-coderail-cleanup'], mark('c')],
                        },
                    );
                    expect(await Deno.readTextFile(`${root}/order`)).toBe(
                        phase === 'pre' || phase === 'launch'
                            ? 'pc'
                            : phase === 'verify'
                              ? 'pc'
                              : 'pvc',
                    );
                    expect(Deno.exitCode).toBe(1);
                    expect(
                        output.some((line) => line.includes('Cleanup') && line.includes('fail')),
                    ).toBe(true);
                });
            }
        }
    },
);

Deno.test(
    'Verify skips actions without matching commands and validates before preparation',
    async () => {
        await fixture(async (root, run) => {
            const actions = {
                pre: [[Deno.execPath(), 'eval', "Deno.writeTextFileSync('marker', '')"]],
            };
            for (const rules of [
                [],
                [{ pattern: 'other', commands: [['unused']] }],
                [
                    {
                        pattern: '*',
                        commands: [[]],
                    },
                ],
            ]) {
                await run(['a'], rules, undefined, root, actions);
            }
            await expect(run(['missing'], [], undefined, root, actions)).rejects.toThrow();
            await expect(
                run(['a'], [{ pattern: '${bad', commands: [] }], undefined, root, actions),
            ).rejects.toThrow();
            await expect(Deno.stat(`${root}/marker`)).rejects.toThrow();
        });
    },
);

Deno.test('Verify reports verbose launch failures and still streams cleanup', async () => {
    await fixture(async (root, run, output, info) => {
        Log.level = 'verbose';
        const missing = [`${root}/missing-executable`];
        const post = [Deno.execPath(), 'eval', "console.log('cleanup')"];
        await run(['a'], [{ pattern: '*', commands: [missing] }], undefined, root, {
            post: [post],
        });
        expect(Deno.exitCode).toBe(1);
        expect(output).toEqual([
            `a ${Log.color.red('fail')}`,
            `  ${JSON.stringify(missing)} ${Log.color.red('fail')}`,
            `Cleanup ${Log.color.green('ok')}`,
            `  ${JSON.stringify(post)} ${Log.color.green('ok')}`,
        ]);
        expect(info).toEqual([
            JSON.stringify(missing),
            expect.stringContaining('missing-executable'),
            JSON.stringify(post),
            'cleanup',
        ]);
    });
});

Deno.test('Verify successful cleanup preserves failures and runs after cancellation', async () => {
    await fixture(async (root, run) => {
        const post = [
            [Deno.execPath(), 'eval', "Deno.writeTextFileSync('clean', 'x', {append:true})"],
        ];
        await run(
            ['a'],
            [{ pattern: '*', commands: [[Deno.execPath(), 'eval', 'Deno.exit(1)']] }],
            undefined,
            root,
            { post },
        );
        expect(Deno.exitCode).toBe(1);
        const controller = new AbortController();
        const pending = run(
            ['a'],
            [
                {
                    pattern: '*',
                    commands: [
                        [
                            Deno.execPath(),
                            'eval',
                            "Deno.writeTextFileSync('started', ''); setInterval(() => {}, 1000)",
                        ],
                    ],
                },
            ],
            controller.signal,
            root,
            { post },
        );
        const timer = setInterval(() => {
            try {
                Deno.statSync(`${root}/started`);
                controller.abort(new Error('cancelled'));
            } catch {
                /* wait for child */
            }
        }, 10);
        try {
            await expect(pending).rejects.toThrow('cancelled');
        } finally {
            clearInterval(timer);
        }
        expect(await Deno.readTextFile(`${root}/clean`)).toBe('xx');
    });
});

Deno.test('Verify dry run plans checks and actions without executing commands', async () => {
    await fixture(async (root, run, output, info) => {
        const write = [Deno.execPath(), 'eval', "Deno.writeTextFileSync('marker', '')"];
        const fail = [Deno.execPath(), 'eval', 'Deno.exit(1)'];
        const missing = [`${root}/missing-executable`];
        const rules = [
            { pattern: 'a', commands: [write, fail, missing] },
            { pattern: 'b', requires: ['marker'], commands: [write] },
        ];
        for (const short of [false, true]) {
            output.length = 0;
            await run(['--dry', ...(short ? ['--short'] : []), 'a', 'b'], rules, undefined, root, {
                pre: [[], write],
                post: [fail, [], missing],
            });
            const planned = Log.color.cyan('planned');
            expect(output).toEqual(
                short
                    ? [`a ${planned}`, `b ${Log.color.yellow('skipped')}`]
                    : [
                          `Preparation ${planned}`,
                          `  ${JSON.stringify(write)} ${planned}`,
                          `a ${planned}`,
                          ...[write, fail, missing].map(
                              (command) => `  ${JSON.stringify(command)} ${planned}`,
                          ),
                          `b ${Log.color.yellow('skipped')}`,
                          `Cleanup ${planned}`,
                          `  ${JSON.stringify(fail)} ${planned}`,
                          `Cleanup ${planned}`,
                          `  ${JSON.stringify(missing)} ${planned}`,
                      ],
            );
            expect(Deno.exitCode).toBe(0);
            expect(info).toEqual([]);
            await expect(Deno.stat(`${root}/marker`)).rejects.toThrow();
        }
        output.length = 0;
        await run(['--dry', 'a'], [], undefined, root, { pre: [write], post: [write] });
        expect(output).toEqual([`a ${Log.color.yellow('skipped')}`, 'No tests found']);
    });
});
