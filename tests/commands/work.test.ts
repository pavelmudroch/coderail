import { expect } from '@std/expect';
import { join } from '@std/path';

import { Work } from '../../src/commands/work.ts';
import { Start } from '../../src/commands/work/start.ts';
import { captureOutput } from '../log/helpers.ts';
import { crOutput, git } from './archive/fixtures.ts';

const decoder = new TextDecoder();

async function cli(
    cwd: string,
    ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
    const { code, stdout, stderr } = await crOutput(cwd, ...args);
    return { code, stdout: decoder.decode(stdout), stderr: decoder.decode(stderr) };
}

async function status(cwd: string, selected = cwd): Promise<unknown> {
    const result = await cli(cwd, 'work', '--json', '--cwd', selected);
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(result.stdout.endsWith('\n')).toBe(true);
    return JSON.parse(result.stdout);
}

async function commit(cwd: string, message: string): Promise<void> {
    await git(
        cwd,
        '-c',
        'user.name=Coderail Tests',
        '-c',
        'user.email=coderail@example.test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=.git/no-hooks',
        'commit',
        '--allow-empty',
        '-m',
        message,
    );
}

async function expectedStatus(
    cwd: string,
    work: string | null,
): Promise<Record<string, string | null>> {
    const branch = await git(cwd, 'branch', '--show-current');
    const upstream = await git(cwd, 'rev-parse', '--abbrev-ref', '@{upstream}');
    const headCommit = await git(cwd, 'rev-parse', 'HEAD');
    const baseCommit = await git(cwd, 'merge-base', upstream, 'HEAD');
    return {
        work,
        branch,
        upstream,
        baseCommit,
        headCommit,
        reviewRange: `${baseCommit}..${headCommit}`,
    };
}

async function snapshot(cwd: string): Promise<string[]> {
    return await Promise.all([
        git(cwd, 'show-ref', '--head'),
        git(cwd, 'config', '--local', '--list'),
    ]);
}

Deno.test(
    'work status follows regular, work and archive branches through Git history',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            await git(root, 'init', '--initial-branch=main');
            await Deno.writeTextFile(join(root, 'tracked'), 'committed');
            await git(root, 'add', 'tracked');
            await commit(root, 'common');
            await git(root, 'switch', '-c', 'topic', '--track', 'main');

            const equalTips = await expectedStatus(root, null);
            expect(equalTips.baseCommit).toBe(equalTips.headCommit);
            expect(await status(root)).toEqual(equalTips);

            await git(root, 'switch', 'main');
            await commit(root, 'upstream advance');
            await git(root, 'switch', 'topic');
            expect(await status(root)).toEqual(await expectedStatus(root, null));

            await git(root, 'switch', '-c', 'coderail/work/feature/nested', '--track', 'main');
            await commit(root, 'work change');
            const expected = await expectedStatus(root, 'feature/nested');
            const before = await snapshot(root);
            const nested = join(root, 'nested');
            await Deno.mkdir(nested);
            expect(await status(root, nested)).toEqual(expected);

            await Deno.writeTextFile(join(root, 'tracked'), 'staged');
            await git(root, 'add', 'tracked');
            await Deno.writeTextFile(join(root, 'tracked'), 'unstaged');
            await Deno.writeTextFile(join(nested, 'untracked'), 'untracked');
            expect(await status(root, nested)).toEqual(expected);

            await git(root, 'config', 'core.abbrev', '12');
            const base = await git(root, 'rev-parse', '--short', expected.baseCommit as string);
            const head = await git(root, 'rev-parse', '--short', 'HEAD');
            const text = await cli(root, 'work');
            expect(text).toMatchObject({ code: 0, stderr: '' });
            expect(text.stdout.replaceAll('\x1b[0K', '')).toBe(
                [
                    'Work: feature/nested',
                    'Branch: coderail/work/feature/nested',
                    'Upstream: main',
                    `Base: ${base}`,
                    `HEAD: ${head}`,
                    `Review range: ${base}..${head}`,
                    '',
                ].join('\n'),
            );
            await git(root, 'config', '--unset', 'core.abbrev');
            expect(await snapshot(root)).toEqual(before);
            await expect(Deno.stat(join(root, '.coderail'))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );

            await git(root, 'switch', '-c', 'coderail/archive-history', '--track', 'main');
            expect(await status(root)).toEqual(await expectedStatus(root, null));
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('work status handles unborn, missing, unrelated, and detached comparisons', async () => {
    const root = await Deno.makeTempDir();
    const absent = {
        work: null,
        upstream: null,
        baseCommit: null,
        headCommit: null,
        reviewRange: null,
    };
    try {
        await git(root, 'init', '--initial-branch=main');
        expect(await status(root)).toEqual({ ...absent, branch: 'main' });
        const text = await cli(root, 'work', '--');
        expect(text).toMatchObject({ code: 0, stderr: '' });
        expect(text.stdout.replaceAll('\x1b[0K', '')).toBe(
            [
                'Work: none',
                'Branch: main',
                'Upstream: unavailable',
                'Base: unavailable',
                'HEAD: unavailable',
                'Review range: unavailable',
                '',
            ].join('\n'),
        );

        await git(root, 'config', 'branch.main.remote', 'origin');
        await git(root, 'config', 'branch.main.merge', 'refs/heads/upstream');
        await git(root, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
        expect(await status(root)).toEqual({
            ...absent,
            branch: 'main',
            upstream: 'origin/upstream',
        });

        await commit(root, 'main');
        const headCommit = await git(root, 'rev-parse', 'HEAD');
        const main = { ...absent, branch: 'main', headCommit };
        expect(await status(root)).toEqual({ ...main, upstream: 'origin/upstream' });

        await git(root, 'switch', '--orphan', 'unrelated');
        await commit(root, 'unrelated');
        await git(root, 'switch', 'main');
        await git(root, 'branch', '--set-upstream-to=unrelated');
        expect(await status(root)).toEqual({ ...main, upstream: 'unrelated' });

        const linked = join(root, 'linked');
        await git(root, 'worktree', 'add', '--detach', linked, 'HEAD');
        expect(await status(root, linked)).toEqual({ ...main, branch: null });
        const detached = await cli(linked, 'work');
        expect(detached.stdout).toContain('Branch: unavailable');

        await git(root, 'branch', '--unset-upstream');
        expect(await status(root)).toEqual(main);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('work help and usage errors work outside a Git repository', async () => {
    const root = await Deno.makeTempDir();
    try {
        const help = [
            { args: ['--help'], usage: '  work                 Show the current work context' },
            { args: ['work', '--help', '--bad'], usage: 'cr work [--help] [--json] [<command>]' },
            { args: ['work', '-h'], usage: 'cr work [--help] [--json] [<command>]' },
            { args: ['work', 'start', '-h'], usage: 'cr work start [--help] <work-name>' },
            {
                args: ['work', '--', 'start', '--help'],
                usage: 'cr work start [--help] <work-name>',
            },
        ];
        for (const { args, usage } of help) {
            const result = await cli(root, ...args);
            expect(result).toMatchObject({ code: 0, stderr: '' });
            expect(result.stdout).toContain(usage);
        }

        const errors = [
            { args: ['--bad'], message: 'Unknown option "--bad".' },
            { args: ['--json=true'], message: 'Option "--json" does not take a value.' },
            { args: ['--help=true'], message: 'Option "--help" does not take a value.' },
            { args: ['unknown'], message: 'Unknown work subcommand "unknown".' },
            {
                args: ['--json', 'start'],
                message: 'Option "--json" is available only for work status.',
            },
            { args: ['start', '--json'], message: 'Unknown option "--json".' },
            { args: ['start'], message: 'Missing required work name.' },
        ];
        const command = new Work();
        for (const { args, message } of errors) {
            expect(() => {
                const parsed = command.parseArguments(args);
                const subcommand = command.getSubcommand(parsed);
                subcommand?.parseArguments(parsed.rest);
            }).toThrow(message);
            const result = await cli(root, 'work', ...args);
            expect(result).toMatchObject({ code: 2, stdout: '' });
            expect(result.stderr).toContain(message);
            expect(result.stderr).toContain('Usage:');
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('work status reports Git command failures', async () => {
    const root = await Deno.makeTempDir();
    try {
        const outside = await cli(root, 'work', '--json');
        expect(outside).toMatchObject({ code: 1, stdout: '' });
        expect(outside.stderr).toContain('not a git repository');

        const bare = join(root, 'bare');
        await git(root, 'init', '--bare', bare);
        const bareResult = await cli(bare, 'work', '--json');
        expect(bareResult).toMatchObject({ code: 1, stdout: '' });
        expect(bareResult.stderr).toContain('Git working tree');

        await git(root, 'init', '--initial-branch=main');
        await commit(root, 'main');
        await git(root, 'config', 'core.abbrev', 'invalid-value');
        const failure = await cli(root, 'work', '--json');
        expect(failure).toMatchObject({ code: 1, stdout: '' });
        expect(failure.stderr).toContain('core.abbrev');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Work parses status options and forwards start arguments', () => {
    const command = new Work();
    expect(command.requiresInit).toBe(false);
    const parsed = command.parseArguments(['--json', '--']);
    expect(parsed).toEqual({ args: { help: false, json: true, command: undefined }, rest: [] });
    expect(command.getSubcommand(parsed)).toBeUndefined();
    expect(command.shouldHandleHelp(parsed)).toBe(false);
    expect(command.getUsage()).toContain('Output work status in JSON format.');
    for (const help of ['-h', '--help']) {
        expect(command.shouldHandleHelp(command.parseArguments([help]))).toBe(true);
    }
    for (const args of [
        ['start', 'name'],
        ['--', 'start', 'name'],
    ]) {
        const start = command.parseArguments(args);
        expect(start).toEqual({
            args: { help: false, json: false, command: 'start' },
            rest: ['name'],
        });
        expect(command.getSubcommand(start)).toBeInstanceOf(Start);
    }
});

Deno.test('Work renders both status formats through the command contract', async () => {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '--initial-branch=main');
        await commit(root, 'initial');
        await git(root, 'switch', '-c', 'coderail/work/topic', '--track', 'main');
        await commit(root, 'work change');
        const command = new Work();
        const run = (...flags: string[]): Promise<void> =>
            command.run({
                context: { currentWorkingDirectory: root, installRoot: root },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                parsedArguments: command.parseArguments(flags),
                signal: new AbortController().signal,
            });
        const expected = await expectedStatus(root, 'topic');
        const base = await git(root, 'rev-parse', '--short', 'main');
        const head = await git(root, 'rev-parse', '--short', 'HEAD');
        using captured = captureOutput();
        await run('--json');
        expect(captured.stdout.join('')).toBe(`${JSON.stringify(expected, null, 4)}\n`);
        captured.stdout.length = 0;
        await run();
        expect(captured.stdout.join('').replaceAll('\x1b[0K', '')).toBe(
            [
                'Work: topic',
                'Branch: coderail/work/topic',
                'Upstream: main',
                `Base: ${base}`,
                `HEAD: ${head}`,
                `Review range: ${base}..${head}`,
                '',
            ].join('\n'),
        );

        captured.stdout.length = 0;
        await git(root, 'switch', '--detach');
        await run();
        expect(captured.stdout.join('').replaceAll('\x1b[0K', '')).toBe(
            [
                'Work: none',
                'Branch: unavailable',
                'Upstream: unavailable',
                'Base: unavailable',
                `HEAD: ${head}`,
                'Review range: unavailable',
                '',
            ].join('\n'),
        );
        captured.stdout.length = 0;
        await git(root, 'switch', '--orphan', 'unborn');
        await run();
        expect(captured.stdout.join('')).toContain('HEAD: unavailable');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
