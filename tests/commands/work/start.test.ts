import { expect } from '@std/expect';
import { join } from '@std/path';

import { Start } from '../../../src/commands/work/start.ts';
import { captureOutput } from '../../log/helpers.ts';
import { crOutput, git } from '../archive/fixtures.ts';

async function cli(
    cwd: string,
    ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
    const { code, stdout, stderr } = await crOutput(cwd, 'work', ...args);
    const decoder = new TextDecoder();
    return {
        code,
        stdout: decoder.decode(stdout).replaceAll('\x1b[0K', ''),
        stderr: decoder.decode(stderr),
    };
}

async function commit(cwd: string, message: string): Promise<void> {
    await git(
        cwd,
        '-c',
        'user.name=Coderail Tests',
        '-c',
        'user.email=coderail@example.test',
        '-c',
        'core.hooksPath=../no-hooks',
        'commit',
        '--no-gpg-sign',
        '--allow-empty',
        '-m',
        message,
    );
}

async function snapshot(cwd: string): Promise<string[]> {
    return await Promise.all([
        git(cwd, 'worktree', 'list', '--porcelain'),
        git(cwd, 'for-each-ref'),
        git(cwd, 'config', '--local', '--list'),
    ]);
}

async function expectRejected(cwd: string, name: string, message: string): Promise<void> {
    const before = await snapshot(cwd);
    const result = await cli(cwd, 'start', name);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain(message);
    expect(await snapshot(cwd)).toEqual(before);
}

Deno.test('work start from a nested directory tracks the exact local branch', async () => {
    const root = await Deno.makeTempDir();
    try {
        const repo = join(root, 'repo');
        const nested = join(repo, 'nested');
        await Deno.mkdir(nested, { recursive: true });
        await git(repo, 'init', '--initial-branch=base');
        await Deno.writeTextFile(join(repo, '.gitignore'), 'ignored\n');
        await git(repo, 'add', '.gitignore');
        await commit(repo, 'base');
        await git(repo, 'switch', '-c', 'main', '--track=direct', 'base');
        await git(repo, 'tag', '--no-sign', 'main');
        await commit(repo, 'advance main past the tag and upstream');
        await git(repo, 'config', 'branch.autoSetupMerge', 'inherit');
        await git(repo, 'config', 'core.warnAmbiguousRefs', 'true');
        await Deno.writeTextFile(join(nested, 'ignored'), 'ignored');
        const tip = await git(repo, 'rev-parse', 'HEAD');

        const branch = 'coderail/work/internal-archive-history';
        expect(await cli(root, 'start', 'internal/archive-history', '--cwd', nested)).toEqual({
            code: 0,
            stdout: `Started work on ${branch}.\n`,
            stderr: '',
        });
        expect(await git(repo, 'branch', '--show-current')).toBe(branch);
        expect(await git(repo, 'rev-parse', 'refs/heads/main')).toBe(tip);
        expect(await git(repo, 'rev-parse', 'HEAD')).toBe(tip);
        expect(await git(repo, 'config', `branch.${branch}.remote`)).toBe('.');
        expect(await git(repo, 'config', `branch.${branch}.merge`)).toBe('refs/heads/main');
        expect(await Deno.readTextFile(join(nested, 'ignored'))).toBe('ignored');
        await expect(Deno.stat(join(repo, '.coderail'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );

        const result = await cli(root, '--json', '--cwd', nested);
        expect(result).toMatchObject({ code: 0, stderr: '' });
        expect(JSON.parse(result.stdout)).toEqual({
            work: 'internal-archive-history',
            branch,
            upstream: 'heads/main',
            baseCommit: tip,
            headCommit: tip,
            reviewRange: `${tip}..${tip}`,
        });
        await expectRejected(repo, 'nested work', 'already on a work branch');
        await git(repo, 'switch', 'main');
        await expectRejected(repo, 'Internal Archive History', `Branch "${branch}" already exists`);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('work start rejects invalid source and destination refs before switching', async () => {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '--initial-branch=main');
        await expectRejected(root, 'topic', 'at least one commit');
        await commit(root, 'initial');
        await expectRejected(root, '/ ! /', 'empty slug');
        await git(root, 'branch', 'coderail/work/topic');
        await expectRejected(root, 'topic', 'already exists');
        await git(root, 'switch', '--detach');
        await expectRejected(root, 'topic', 'current local branch');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('work start rejects unstaged, staged, untracked, and submodule changes', async () => {
    const root = await Deno.makeTempDir();
    try {
        const repo = join(root, 'repo');
        const origin = join(root, 'submodule-origin');
        await git(root, 'init', '--initial-branch=main', repo);
        await git(root, 'init', '--initial-branch=main', origin);
        await Deno.writeTextFile(join(origin, 'tracked'), 'committed');
        await git(origin, 'add', 'tracked');
        await commit(origin, 'submodule initial');
        await git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', origin, 'sub');
        const tracked = join(repo, 'tracked');
        await Deno.writeTextFile(tracked, 'committed');
        await git(repo, 'add', 'tracked');
        await commit(repo, 'initial');

        await Deno.writeTextFile(tracked, 'changed');
        await expectRejected(repo, 'topic', 'clean working tree');
        await git(repo, 'add', 'tracked');
        await expectRejected(repo, 'topic', 'clean working tree');
        await git(repo, 'restore', '--staged', '--worktree', 'tracked');

        await git(repo, 'config', 'status.showUntrackedFiles', 'no');
        const untracked = join(repo, 'untracked');
        await Deno.writeTextFile(untracked, 'untracked');
        await expectRejected(repo, 'topic', 'clean working tree');
        await Deno.remove(untracked);

        await git(repo, 'config', 'submodule.sub.ignore', 'all');
        await Deno.writeTextFile(join(repo, 'sub', 'tracked'), 'changed');
        await expectRejected(repo, 'topic', 'clean working tree');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('work start handles help, usage, and Git errors outside a working tree', async () => {
    const root = await Deno.makeTempDir();
    try {
        const command = new Start();
        expect(command.requiresInit).toBe(false);
        expect(command.getSubcommand()).toBeUndefined();
        for (const help of ['-h', '--help']) {
            expect(command.shouldHandleHelp(command.parseArguments([help]))).toBe(true);
            const result = await cli(root, 'start', help, '--bad');
            expect(result).toMatchObject({ code: 0, stderr: '' });
            expect(result.stdout).toBe(`${command.getUsage()}\n`);
        }
        const parsed = command.parseArguments(['--', '-topic']);
        expect(parsed).toEqual({ args: { help: false, workName: '-topic' }, rest: [] });
        expect(command.shouldHandleHelp(parsed)).toBe(false);
        expect(command.parseArguments(['topic', '--help'])).toEqual({
            args: { help: true, workName: '' },
            rest: [],
        });
        const errors = [
            { args: [], message: 'Missing required work name.' },
            { args: ['  '], message: 'Missing required work name.' },
            { args: ['--'], message: 'Missing required work name.' },
            { args: ['--help=true'], message: 'Option "--help" does not take a value.' },
            { args: ['--bad'], message: 'Unknown option "--bad".' },
            { args: ['topic', 'extra'], message: 'Unexpected arguments: extra' },
            {
                args: ['topic', '--', 'extra', 'names'],
                message: 'Unexpected arguments: extra names',
            },
        ];
        for (const { args, message } of errors) {
            expect(() => command.parseArguments(args)).toThrow(message);
            const result = await cli(root, 'start', ...args);
            expect(result).toMatchObject({ code: 2, stdout: '' });
            expect(result.stderr).toContain(message);
            expect(result.stderr).toContain('cr work start [--help] <work-name>');
        }

        const outside = await cli(root, 'start', 'topic');
        expect(outside).toMatchObject({ code: 1, stdout: '' });
        expect(outside.stderr).toContain('not a git repository');
        await git(root, 'init', '--bare', '.');
        const bare = await cli(root, 'start', 'topic');
        expect(bare).toMatchObject({ code: 1, stdout: '' });
        expect(bare.stderr).toContain('requires a Git working tree');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Start runs with the command context and honors cancellation', async () => {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '--initial-branch=main');
        await commit(root, 'initial');
        const command = new Start();
        const run = (signal: AbortSignal): Promise<void> =>
            command.run({
                context: { currentWorkingDirectory: root, installRoot: root },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                parsedArguments: command.parseArguments(['My Topic']),
                signal,
            });
        using captured = captureOutput();
        const reason = new Error('cancel start');
        await expect(run(AbortSignal.abort(reason))).rejects.toBe(reason);
        expect(captured.stdout).toEqual([]);
        await run(new AbortController().signal);
        expect(captured.stdout.join('').replaceAll('\x1b[0K', '')).toBe(
            'Started work on coderail/work/my-topic.\n',
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
