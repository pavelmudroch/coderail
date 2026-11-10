import { expect } from '@std/expect';

import { Loop } from '../../src/commands/loop.ts';

Deno.test('Loop parses help, harness, limits, and native settings', () => {
    const command = new Loop();
    expect(command.requiresInit).toBe(true);
    expect(command.shouldHandleHelp(command.parseArguments(['--help']))).toBe(true);
    expect(command.getUsage()).toContain('-o');
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([]).args.autoReview).toBe(false);
    expect(command.parseArguments(['-r']).args.autoReview).toBe(true);
    expect(command.parseArguments(['--auto-review']).args.autoReview).toBe(true);
    expect(
        command.parseArguments(['codex', '-l', '2', '-o', 'model=Native/Model,effort=HIGH']).args,
    ).toEqual({
        help: false,
        autoReview: false,
        autoCommit: false,
        harness: 'codex',
        limit: 2,
        options: { model: 'Native/Model', effort: 'HIGH' },
    });
    for (const args of [
        [],
        ['claude'],
        ['--auto-review'],
        ['-r'],
        ['-o', 'review-model=x,review-effort=y'],
        ['--limit=1'],
        ['-o', 'implement-model=x,implement-effort=y'],
    ]) {
        expect(command.parseArguments(args).rest).toEqual([]);
    }
});

Deno.test('Loop rejects unsupported stages, malformed options, arguments, and limits', () => {
    for (const args of [
        ['--auto-review=true'],
        ['-r=false'],
        ['--auto-commit=true'],
        ['-c=false'],
        ['-rc=false'],
        ['-rx'],
        ['-rcl'],
        ['codex', 'extra'],
        ['--help=true'],
        ['--limit'],
        ['--limit=0'],
        ['-l', '-1'],
        ['-l', '1.5'],
        ['-l', '9007199254740992'],
        ['-o'],
        ['-o', 'model='],
        ['-o', 'effort= '],
        ['-o', 'model'],
        ['-o', '=x'],
        ['-o', 'unknown=x'],
        ['-o', 'model=x,'],
        ['-o', 'model=x=y'],
        ['--wat'],
    ]) {
        expect(() => new Loop().parseArguments(args)).toThrow();
    }
});

Deno.test(
    'Loop validates harness/default selection before sessions and resolves native settings from initialized root',
    async () => {
        const { Harness } = await import('@harness');
        const { Log } = await import('@log');
        const command = new Loop();
        const root = await Deno.makeTempDir();
        const originalGet = Harness.get;
        const originalOutput = Log.output;
        const originalInfo = Log.info;
        const originalInteractive = Log.nonInteractive;
        const calls: import('@harness').RunRequest[] = [];
        let disposed = 0;
        const messages: string[] = [];
        const run = (
            args: string[],
            defaultHarness?: string,
            repositoryRoot: string | undefined = root,
        ): Promise<void> =>
            command.run({
                context: {
                    currentWorkingDirectory: `${root}/subfolder`,
                    repositoryRoot,
                    installRoot: root,
                },
                configuration: {
                    defaultHarness,
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                    loop: {
                        codex: {
                            model: 'saved',
                            implementEffort: 'native-effort',
                            reviewModel: 'disabled',
                            commitModel: 'saved-commit',
                        },
                    },
                },
                parsedArguments: command.parseArguments(args),
                signal: new AbortController().signal,
            });
        try {
            Log.output = (...args) => {
                messages.push(args.join(' '));
            };
            Log.info = () => {};
            Log.nonInteractive = true;
            for (const [args, defaultHarness] of [
                [[], undefined],
                [[], 'unknown'],
                [['wrong'], 'codex'],
            ] as const) {
                await expect(run([...args], defaultHarness)).rejects.toThrow();
            }
            await expect(
                command.run({
                    context: { currentWorkingDirectory: root, installRoot: root },
                    configuration: {
                        logLevel: 'normal',
                        noColor: true,
                        nonInteractive: true,
                        verify: { rules: [] },
                    },
                    parsedArguments: command.parseArguments(['codex']),
                    signal: new AbortController().signal,
                }),
            ).rejects.toThrow('No initialized project');
            Harness.get = () => null;
            await expect(run(['codex'])).rejects.toThrow('unavailable');
            const result = await new Deno.Command('git', {
                cwd: root,
                args: ['init', '-q'],
            }).output();
            expect(result.success).toBe(true);
            await Deno.writeTextFile(`${root}/.git/info/exclude`, '.coderail/loop/\n');
            Harness.get = (name, target) => {
                expect(['codex', 'claude']).toContain(name);
                expect(target).toEqual({ scope: 'local', projectRoot: root });
                return {
                    name,
                    home: root,
                    run: (request) => {
                        calls.push(request);
                        return Promise.resolve({
                            async *[Symbol.asyncIterator]() {},
                            result: () => Promise.resolve({ finalMessage: 'OK' }),
                            [Symbol.asyncDispose]: () => Promise.resolve(),
                        });
                    },
                    translateSkill: () => Promise.resolve([]),
                    translateGlobalInstructions: () => Promise.resolve([]),
                    translateSubagent: () => Promise.resolve([]),
                    [Symbol.dispose]: () => {
                        disposed++;
                    },
                };
            };
            await run([], 'codex');
            await run(
                ['codex', '--options=model=CLI,implement-effort=HIGH', '--limit', '3'],
                'claude',
            );
            await run(['claude']);
            await run(['codex', '-r']);
            await run(['claude', '-r', '-o', 'review-model=review,review-effort=native']);
            await run(['codex', '-c']);
            await run(['claude', '-rc', '-o', 'commit-model=commit,commit-effort=LOW']);
            expect(calls.map(({ model, effort, cwd }) => ({ model, effort, cwd }))).toEqual([
                { model: 'saved', effort: 'native-effort', cwd: root },
                { model: 'CLI', effort: 'HIGH', cwd: root },
                { model: undefined, effort: undefined, cwd: root },
                { model: 'saved', effort: 'native-effort', cwd: root },
                { model: 'disabled', effort: undefined, cwd: root },
                { model: undefined, effort: undefined, cwd: root },
                { model: 'review', effort: 'native', cwd: root },
                { model: 'saved', effort: 'native-effort', cwd: root },
                { model: 'saved-commit', effort: undefined, cwd: root },
                { model: undefined, effort: undefined, cwd: root },
                { model: 'commit', effort: 'LOW', cwd: root },
            ]);
            expect(disposed).toBe(7);
            expect(messages.filter((line) => line.startsWith('Loop complete'))).toHaveLength(7);
            expect(command.parseArguments(new Array<string>(1))).toEqual(
                command.parseArguments([]),
            );
            expect(command.parseArguments(['--']).rest).toEqual([]);
            expect(() => command.parseArguments(['--', 'extra'])).toThrow();
            expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
        } finally {
            Harness.get = originalGet;
            Log.output = originalOutput;
            Log.info = originalInfo;
            Log.nonInteractive = originalInteractive;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('Loop parses independent review/commit flags and combined short flags', () => {
    const command = new Loop();
    for (const [flags, review, commit] of [
        [[], false, false],
        [['-r'], true, false],
        [['-c'], false, true],
        [['--auto-commit'], false, true],
        [['-rc'], true, true],
        [['-cr'], true, true],
        [['-r', '-c'], true, true],
        [['--auto-review', '--auto-commit'], true, true],
    ] as const) {
        const { args } = command.parseArguments(flags);
        expect(args.autoReview).toBe(review);
        expect(args.autoCommit).toBe(commit);
    }
    expect(
        command.parseArguments(['-o', 'commit-model=native,commit-effort=HIGH']).args.options,
    ).toEqual({ 'commit-model': 'native', 'commit-effort': 'HIGH' });
});
