import { expect } from '@std/expect';

import { abbreviateWorkCommit, getWorkStatus, startWork } from '../src/work.ts';
import { fixtureGit as git } from './archive/fixtures.ts';

const signal = new AbortController().signal;
const missing = {
    work: null,
    branch: null,
    upstream: null,
    baseCommit: null,
    headCommit: null,
    reviewRange: null,
};

async function commit(root: string, message: string): Promise<string> {
    await git(
        root,
        '-c',
        'core.hooksPath=.git/no-hooks',
        'commit',
        '--no-gpg-sign',
        '--allow-empty',
        '-m',
        message,
    );
    return await git(root, 'rev-parse', 'HEAD');
}

Deno.test('getWorkStatus separates missing comparisons from Git errors', async () => {
    const root = await Deno.makeTempDir();
    try {
        await expect(getWorkStatus(root, signal)).rejects.toThrow('Git rev-parse failed');
        await git(root, 'init', '--bare', '.');
        await expect(getWorkStatus(root, signal)).rejects.toThrow('requires a Git working tree');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('getWorkStatus resolves a custom tracking ref and uses full commit IDs', async () => {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '--initial-branch=main');
        expect(await getWorkStatus(root, signal)).toEqual({ ...missing, branch: 'main' });
        await git(root, 'config', 'branch.main.remote', '.');
        await git(root, 'config', 'branch.main.merge', 'refs/heads/base');
        expect(await getWorkStatus(root, signal)).toEqual({
            ...missing,
            branch: 'main',
            upstream: 'base',
        });

        const base = await commit(root, 'initial');
        await git(root, 'switch', '-c', 'coderail/work/topic');
        const head = await commit(root, 'topic change');
        const status = {
            ...missing,
            branch: 'coderail/work/topic',
            work: 'topic',
            headCommit: head,
        };
        expect(await getWorkStatus(root, signal)).toEqual(status);

        await git(root, 'config', 'branch.coderail/work/topic.remote', 'origin');
        await git(root, 'config', 'branch.coderail/work/topic.merge', 'refs/heads/main');
        await git(root, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/snapshot/*');
        const upstream = 'snapshot/main';
        expect(await getWorkStatus(root, signal)).toEqual({ ...status, upstream });

        await git(root, 'update-ref', 'refs/remotes/snapshot/main', base);
        expect(await getWorkStatus(root, signal)).toEqual({
            ...status,
            upstream,
            baseCommit: base,
            reviewRange: `${base}..${head}`,
        });
        expect(await abbreviateWorkCommit(root, signal, head)).toBe(
            await git(root, 'rev-parse', '--short', 'HEAD'),
        );
        expect(await abbreviateWorkCommit(root, signal, null)).toBeNull();

        await git(root, 'switch', '--detach');
        expect(await getWorkStatus(root, signal)).toEqual({ ...missing, headCommit: head });

        await git(root, 'switch', '--orphan', 'unrelated');
        await commit(root, 'unrelated');
        await git(root, 'update-ref', 'refs/remotes/snapshot/main', 'HEAD');
        await git(root, 'switch', 'coderail/work/topic');
        expect(await getWorkStatus(root, signal)).toEqual({ ...status, upstream });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('getWorkStatus honors an already aborted signal', async () => {
    const reason = new Error('cancel status');
    await expect(getWorkStatus('.', AbortSignal.abort(reason))).rejects.toBe(reason);
});

Deno.test('startWork validates the checkout and tracks the source branch', async () => {
    const root = await Deno.makeTempDir();
    try {
        await git(root, 'init', '--initial-branch=main');
        const start = (name: string): Promise<string> => startWork(root, name, signal);
        await expect(start('topic')).rejects.toThrow('at least one commit');

        const tip = await commit(root, 'initial');
        await expect(start('!')).rejects.toThrow('empty slug');
        await git(root, 'switch', '--detach');
        await expect(start('topic')).rejects.toThrow('current local branch');
        await git(root, 'switch', 'main');

        await git(root, 'branch', 'coderail/work/conflict/child');
        await expect(start('conflict')).rejects.toThrow('Git switch failed');
        expect(await git(root, 'branch', '--show-current')).toBe('main');
        await expect(start('conflict/child')).resolves.toBe('coderail/work/conflict-child');
        await expect(start('topic')).rejects.toThrow('already on a work branch');
        expect(await git(root, 'config', 'branch.coderail/work/conflict-child.merge')).toBe(
            'refs/heads/main',
        );
        expect(await git(root, 'rev-parse', 'HEAD')).toBe(tip);

        await git(root, 'switch', 'main');
        await expect(start('conflict-child')).rejects.toThrow('already exists');
        await Deno.writeTextFile(`${root}/untracked`, 'untracked');
        await expect(start('topic')).rejects.toThrow('clean working tree');
        expect(await git(root, 'branch', '--show-current')).toBe('main');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
