import { expect } from '@std/expect';
import { Cli } from '@cli';
import { Log } from '@log';
import type { Configuration } from '@conf';
import { Verify } from '../../src/commands/verify.ts';

Deno.test('Verify parses selection, flags, literal paths, and early help', () => {
    const command = new Verify();
    expect(command.requiresInit).toBe(true);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([...new Array<string>(1), 'file']).args.paths).toEqual(['file']);
    for (const flag of ['-s', '--short']) {
        expect(command.parseArguments([flag, '--changed', 'src', '--', '--help'])).toEqual({
            args: { help: false, short: true, changed: true, paths: ['src', '--help'] },
            rest: [],
        });
    }
    expect(command.shouldHandleHelp(command.parseArguments(['file']))).toBe(false);
    for (const help of ['-h', '--help']) {
        expect(command.shouldHandleHelp(command.parseArguments([help, '--unknown']))).toBe(true);
    }
    for (
        const args of [[], ['--'], ['--unknown'], ['-x'], ['--help=true'], ['--short=false'], [
            '--changed=true',
        ]]
    ) {
        try {
            command.parseArguments(args);
            throw new Error('Expected usage error');
        } catch (error) {
            expect(Cli.isUsageError(error)).toBe(true);
        }
    }
    expect(command.getUsage()).toContain('skipped');
});

async function fixture(
    test: (
        root: string,
        run: (
            args: string[],
            rules?: Configuration['verify'],
            signal?: AbortSignal,
            root?: string,
        ) => Promise<void>,
        output: string[],
        info: string[],
    ) => Promise<void>,
): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const original = {
        output: Log.output,
        info: Log.info,
        noColor: Log.noColor,
        exitCode: Deno.exitCode,
    };
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
            (args, rules = [], signal = new AbortController().signal, repositoryRoot = root) =>
                command.run({
                    context: { repositoryRoot, currentWorkingDirectory: root, installRoot: root },
                    configuration: {
                        verify: rules,
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
        Log.noColor = original.noColor;
        Deno.exitCode = original.exitCode;
        await Deno.remove(root, { recursive: true });
    }
}

Deno.test('Verify reports JSON commands and full replayed output, short output, and failures', async () => {
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
        expect(info).toEqual(['out\nerr\n', 'out\nerr\n']);
        expect(await Deno.readTextFile(`${root}/marker`)).toBe('x');
        output.length = info.length = 0;
        await run(['a'], [{ pattern: '*', commands: [[Deno.execPath(), 'eval', '']] }]);
        expect(info).toEqual([]);
        output.length = 0;
        await run(['-s', 'a'], [{
            pattern: '*',
            commands: [[Deno.execPath(), 'eval', 'Deno.exit(1)']],
        }]);
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
});

Deno.test('Verify reports no tests after skipped files or empty selections', async () => {
    await fixture(async (_root, run, output, info) => {
        for (
            const rules of [[], [{ pattern: 'other', commands: [['unused']] }], [{
                pattern: '*',
                requires: ['missing'],
                commands: [['unused']],
            }], [{ pattern: '*', commands: [[], []] }]]
        ) {
            for (const flags of [[], ['-s']]) {
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

Deno.test('Verify validates all rules and paths before executing and propagates invocation errors', async () => {
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
});

Deno.test('Verify runtime supports help outside projects, initialization, cwd, quiet, and changed selection', async () => {
    const root = await Deno.realPath(await Deno.makeTempDir());
    const main = new URL('../../src/main.ts', import.meta.url);
    const config = new URL('../../deno.json', import.meta.url);
    async function invoke(
        ...args: string[]
    ): Promise<{ code: number; stdout: string; stderr: string }> {
        const result = await new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', '--config', config.pathname, main.pathname, '--cwd', root, ...args],
            stdout: 'piped',
            stderr: 'piped',
            env: { NO_COLOR: '1' },
        }).output();
        return {
            code: result.code,
            stdout: new TextDecoder().decode(result.stdout).replaceAll('\x1b[0K', ''),
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
        await Deno.mkdir(`${root}/.coderail`);
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
        // Exercise the real stderr logger while intercepting only stdout statuses.
        const script = `import { Verify } from ${
            JSON.stringify(new URL('../../src/commands/verify.ts', import.meta.url).href)
        };
import { Log } from ${JSON.stringify(new URL('../../src/log.ts', import.meta.url).href)};
Log.level = Deno.args[0] === 'quiet' ? 'quiet' : 'normal'; Log.noColor = true;
const command = new Verify();
await command.run({context:{repositoryRoot:${JSON.stringify(root)},currentWorkingDirectory:${
            JSON.stringify(root)
        },installRoot:${
            JSON.stringify(root)
        }}, configuration:{verify:[{pattern:'a',commands:[[Deno.execPath(),'eval',"console.log('child output')"]]}]}, parsedArguments:command.parseArguments(['a']), signal:new AbortController().signal});`;
        for (const level of ['normal', 'quiet']) {
            const result = await new Deno.Command(Deno.execPath(), {
                args: ['eval', '--config', config.pathname, script, level],
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            expect(result.code).toBe(0);
            expect(new TextDecoder().decode(result.stdout)).toContain('a ok');
            expect(new TextDecoder().decode(result.stderr).includes('child output')).toBe(
                level === 'normal',
            );
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
