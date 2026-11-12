/** Literal pathspecs and a fixed project cwd keep Git mutations inside the initialized subtree. */
async function git(projectRoot: string, args: string[], allowUnbornHead = false): Promise<string> {
    const output = await new Deno.Command('git', {
        cwd: projectRoot,
        args: ['--literal-pathspecs', ...args],
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!output.success && !(allowUnbornHead && output.code === 1)) {
        throw new Error(`Git failed: ${new TextDecoder().decode(output.stderr).trim()}`);
    }
    return new TextDecoder().decode(output.stdout);
}

export async function assertCleanProject(projectRoot: string): Promise<void> {
    const status = await git(projectRoot, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--',
        '.',
    ]);
    if (status !== '') {
        throw new Error(
            'Loop requires a clean initialized project (staged, unstaged, and untracked files).',
        );
    }
}

export async function stageProject(projectRoot: string): Promise<void> {
    await git(projectRoot, ['add', '-A', '--', '.']);
}

export async function assertStagedProject(projectRoot: string): Promise<void> {
    const unstaged = await git(projectRoot, ['diff', '--name-only', '-z', '--', '.']);
    const untracked = await git(projectRoot, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        '.',
    ]);
    if (unstaged !== '' || untracked !== '') {
        throw new Error('Loop requires all changes in the initialized project to be staged.');
    }
}

/** Automatic commits consume the repository index, so no outside entries may be staged. */
export async function assertNoOutsideStagedChanges(projectRoot: string): Promise<void> {
    const args = ['diff', '--cached', '--name-only', '--no-renames', '--no-relative', '-z'];
    const all = await git(projectRoot, args);
    const scoped = new Set((await git(projectRoot, [...args, '--', '.'])).split('\0'));
    if (all.split('\0').some((path) => path && !scoped.has(path))) {
        throw new Error('Auto-commit requires no staged changes outside the initialized project.');
    }
}

export async function hasStagedChanges(projectRoot: string): Promise<boolean> {
    return (await git(projectRoot, ['diff', '--cached', '--name-only', '-z', '--', '.'])) !== '';
}

/** Empty HEAD supports initialized repositories that have no commits yet. */
export async function getHead(projectRoot: string): Promise<string> {
    return (await git(projectRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'], true)).trim();
}

export async function assertCommittedProject(projectRoot: string, before: string): Promise<void> {
    const count = await git(projectRoot, [
        'rev-list',
        '--count',
        'HEAD',
        ...(before ? [`^${before}`] : []),
    ]);
    if (Number(count.trim()) < 1) {
        throw new Error('Commit session did not create any new commits.');
    }
    await assertCleanProject(projectRoot);
}
