import { Text } from '@utils';

export type WorkStatus = {
    work: string | null;
    branch: string | null;
    upstream: string | null;
    baseCommit: string | null;
    headCommit: string | null;
    reviewRange: string | null;
};

const workPrefix = 'coderail/work/';
const decoder = new TextDecoder();

async function git(
    cwd: string,
    signal: AbortSignal,
    args: string[],
    mode: 'allow-missing',
): Promise<string | null>;
async function git(
    cwd: string,
    signal: AbortSignal,
    args: string[],
    mode?: 'allow-stderr',
): Promise<string>;
async function git(
    cwd: string,
    signal: AbortSignal,
    args: string[],
    mode?: 'allow-missing' | 'allow-stderr',
): Promise<string | null> {
    signal.throwIfAborted();
    const result = await new Deno.Command('git', {
        cwd,
        args,
        signal,
        env: { GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' },
        stdin: 'null',
    }).output();
    signal.throwIfAborted();

    const stderr = decoder.decode(result.stderr).trim();
    if (result.success && (stderr === '' || mode === 'allow-stderr')) {
        return decoder.decode(result.stdout).trimEnd();
    }
    if (mode === 'allow-missing' && result.code === 1 && stderr === '') {
        return null;
    }
    throw new Error(`Git ${args[0]} failed (exit ${result.code}): ${stderr}`);
}

function isWorkBranch(branch: string): boolean {
    return branch.startsWith(workPrefix);
}

async function requireWorkingTree(
    cwd: string,
    signal: AbortSignal,
    operation: string,
): Promise<void> {
    if ((await git(cwd, signal, ['rev-parse', '--is-inside-work-tree'])) !== 'true') {
        throw new Error(`${operation} requires a Git working tree.`);
    }
}

async function getUpstream(
    cwd: string,
    signal: AbortSignal,
    branchRef: string,
    headCommit: string | null,
): Promise<string | null> {
    if (headCommit === null) {
        // An unborn branch has no ref for for-each-ref to inspect.
        const status = await git(cwd, signal, [
            'status',
            '--porcelain=v2',
            '--branch',
            '--no-ahead-behind',
            '--untracked-files=no',
            '--ignore-submodules=all',
        ]);
        return /^# branch\.upstream (.+)$/m.exec(status)?.[1] ?? null;
    }

    const upstream = await git(cwd, signal, [
        'for-each-ref',
        '--format=%(upstream:short)',
        branchRef,
    ]);
    return upstream || null;
}

export async function getWorkStatus(cwd: string, signal: AbortSignal): Promise<WorkStatus> {
    await requireWorkingTree(cwd, signal, 'Work status');

    const branchRef = await git(cwd, signal, ['symbolic-ref', '--quiet', 'HEAD'], 'allow-missing');
    const branch = branchRef === null ? null : branchRef.slice('refs/heads/'.length);
    const work = branch !== null && isWorkBranch(branch) ? branch.slice(workPrefix.length) : null;
    const headCommit = await git(
        cwd,
        signal,
        ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'],
        'allow-missing',
    );
    const upstream =
        branchRef === null ? null : await getUpstream(cwd, signal, branchRef, headCommit);

    let baseCommit = null;
    let reviewRange = null;
    if (headCommit !== null && upstream !== null) {
        const upstreamCommit = await git(
            cwd,
            signal,
            ['rev-parse', '--verify', '--quiet', '@{upstream}^{commit}'],
            'allow-missing',
        );
        if (upstreamCommit !== null) {
            baseCommit = await git(
                cwd,
                signal,
                ['merge-base', upstreamCommit, headCommit],
                'allow-missing',
            );
            if (baseCommit !== null) {
                reviewRange = `${baseCommit}..${headCommit}`;
            }
        }
    }

    return { work, branch, upstream, baseCommit, headCommit, reviewRange };
}

export async function startWork(
    cwd: string,
    workName: string,
    signal: AbortSignal,
): Promise<string> {
    await requireWorkingTree(cwd, signal, 'Starting work');
    const slug = Text.slugify(workName);
    if (slug === '') {
        throw new Error('The work name normalizes to an empty slug.');
    }

    const branchRef = await git(cwd, signal, ['symbolic-ref', '--quiet', 'HEAD'], 'allow-missing');
    if (branchRef === null) {
        throw new Error('Starting work requires a current local branch.');
    }
    if (isWorkBranch(branchRef.slice('refs/heads/'.length))) {
        throw new Error('Cannot start work while already on a work branch.');
    }
    const head = await git(
        cwd,
        signal,
        ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'],
        'allow-missing',
    );
    if (head === null) {
        throw new Error('Starting work requires at least one commit on the current branch.');
    }
    const branch = `${workPrefix}${slug}`;
    const existing = await git(
        cwd,
        signal,
        ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
        'allow-missing',
    );
    if (existing !== null) {
        throw new Error(`Branch "${branch}" already exists.`);
    }
    const changes = await git(cwd, signal, [
        'status',
        '--porcelain=v1',
        '--untracked-files=normal',
        '--ignore-submodules=none',
    ]);
    if (changes !== '') {
        throw new Error('Starting work requires a clean working tree.');
    }

    await git(
        cwd,
        signal,
        ['switch', '--create', branch, '--track=direct', branchRef],
        'allow-stderr',
    );
    return branch;
}

export async function abbreviateWorkCommit(
    cwd: string,
    signal: AbortSignal,
    commit: string | null,
): Promise<string | null> {
    return commit === null ? null : await git(cwd, signal, ['rev-parse', '--short', commit]);
}
