import { expect } from '@std/expect';
import { join } from '@std/path';

import {
    assertCleanProject,
    assertCommittedProject,
    assertNoOutsideStagedChanges,
    getHead,
    hasStagedChanges,
    stageProject,
} from '../../../src/commands/loop/git.ts';

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout);
}
async function fixture(run: (root: string, project: string) => Promise<void>): Promise<void> {
    const root = await Deno.makeTempDir();
    const project = join(root, 'nested');
    await Deno.mkdir(project);
    await git(root, 'init', '-q');
    await git(root, 'config', 'user.email', 'test@example.com');
    await git(root, 'config', 'user.name', 'Test');
    await git(root, 'config', 'commit.gpgsign', 'false');
    await Deno.writeTextFile(join(root, '.gitignore'), '.coderail/loop/\n');
    await Deno.writeTextFile(join(root, 'outside'), 'baseline');
    await ticket(project, '0001');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'baseline');
    try {
        await run(root, project);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}
async function ticket(project: string, id: string, dependencies: string[] = []): Promise<void> {
    const directory = join(project, '.coderail/tickets/open');
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(
        join(directory, `${id}-ticket.md`),
        `---\ntitle: Ticket ${id}\nstatus: open\ndependencies: ${JSON.stringify(dependencies)}\n---\nWork\n`,
    );
}
async function close(project: string, id: string, reason = 'done'): Promise<void> {
    const directory = join(project, '.coderail/tickets');
    const path = join(directory, 'open', `${id}-ticket.md`);
    const content = (await Deno.readTextFile(path)).replace(
        'status: open',
        `status: closed\nreason: ${reason}`,
    );
    await Deno.mkdir(join(directory, 'closed'), { recursive: true });
    await Deno.writeTextFile(join(directory, 'closed', `${id}-ticket.md`), content);
    await Deno.remove(path);
}
Deno.test(
    'Loop scopes startup and staging to nested project, preserving outside index',
    async () => {
        await fixture(async (root, project) => {
            await Deno.writeTextFile(join(root, 'outside'), 'staged');
            await git(root, 'add', 'outside');
            await Deno.writeTextFile(join(root, 'outside'), 'unstaged');
            await Deno.writeTextFile(join(root, 'untracked'), 'outside');
            await assertCleanProject(project);
            for (const mode of ['untracked', 'unstaged', 'staged']) {
                const path = join(project, 'file with spaces');
                await Deno.writeTextFile(path, mode);
                if (mode !== 'untracked') {
                    await git(root, 'add', 'nested');
                }
                if (mode === 'unstaged') {
                    await Deno.writeTextFile(path, 'changed');
                }
                await expect(assertCleanProject(project)).rejects.toThrow();
                await git(root, 'reset', '-q', '--', 'nested');
                await Deno.remove(path);
            }
            await Deno.writeTextFile(join(project, 'new file'), 'new');
            await close(project, '0001');
            await stageProject(project);
            expect(await git(root, 'show', ':outside')).toBe('staged');
            expect(await Deno.readTextFile(join(root, 'outside'))).toBe('unstaged');
            expect(await git(root, 'show', ':nested/new file')).toBe('new');
            expect(await git(root, 'diff', '--cached', '--name-status')).toContain(
                'nested/.coderail/tickets/closed',
            );
        });
    },
);

Deno.test('Loop Git failures propagate', async () => {
    const root = await Deno.makeTempDir();
    try {
        await expect(assertCleanProject(root)).rejects.toThrow('Git failed');
        await expect(stageProject(root)).rejects.toThrow('Git failed');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'Commit Git checks require new commits and clean scope, supporting unborn HEAD',
    async () => {
        await fixture(async (root, project) => {
            const before = await getHead(project);
            expect(before).toBe((await git(root, 'rev-parse', 'HEAD')).trim());
            expect(await hasStagedChanges(project)).toBe(false);
            await assertNoOutsideStagedChanges(project);
            await expect(assertCommittedProject(project, before)).rejects.toThrow('new commits');
            await Deno.writeTextFile(join(root, 'outside'), 'staged');
            await git(root, 'add', 'outside');
            await git(root, 'config', 'diff.relative', 'true');
            await expect(assertNoOutsideStagedChanges(project)).rejects.toThrow(
                'staged changes outside',
            );
            await git(root, 'reset', '-q', '--', 'outside');
            await Deno.writeTextFile(join(project, 'new'), 'staged');
            await stageProject(project);
            await assertNoOutsideStagedChanges(project);
            expect(await hasStagedChanges(project)).toBe(true);
            await git(project, 'commit', '-qm', 'iteration');
            await assertCommittedProject(project, before);
            await Deno.writeTextFile(join(project, 'new'), 'dirty');
            await expect(assertCommittedProject(project, before)).rejects.toThrow(
                'clean initialized',
            );
        });
        const root = await Deno.makeTempDir();
        try {
            await git(root, 'init', '-q');
            await git(root, 'config', 'user.email', 'test@example.com');
            await git(root, 'config', 'user.name', 'Test');
            await git(root, 'config', 'commit.gpgsign', 'false');
            expect(await getHead(root)).toBe('');
            await Deno.writeTextFile(join(root, 'new'), 'first');
            await stageProject(root);
            await git(root, 'commit', '-qm', 'first');
            await assertCommittedProject(root, '');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
