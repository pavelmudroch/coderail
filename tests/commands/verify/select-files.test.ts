import { expect } from '@std/expect';
import { join } from '@std/path';
import { selectFiles } from '../../../src/commands/verify/select-files.ts';

Deno.test('selectFiles selects recursive explicit paths safely and deterministically', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, 'nested'));
        for (const path of ['z', '.hidden', '..inside', '.gitignore', 'ignored', 'nested/a']) {
            await Deno.writeTextFile(join(root, path), path === '.gitignore' ? 'ignored' : '');
        }
        await Deno.symlink(join(root, 'nested'), join(root, 'link'));
        await Deno.symlink(join(root, 'absent'), join(root, 'dangling'));
        const signal = new AbortController().signal;
        expect(await selectFiles(root, join(root, 'nested'), ['..', '../z'], false, signal))
            .toEqual(['..inside', '.gitignore', '.hidden', 'ignored', 'nested/a', 'z']);
        expect(await selectFiles(root, root, ['link', 'link/a', 'dangling'], false, signal))
            .toEqual([]);
        expect(await selectFiles(root, root, ['..inside', 'z', 'z'], false, signal))
            .toEqual(['..inside', 'z']);
        for (const path of ['absent', '..']) {
            await expect(selectFiles(root, root, ['z', path], false, signal)).rejects.toThrow();
        }
        const controller = new AbortController();
        const originalLstat = Deno.lstat;
        Deno.lstat = async (...args): Promise<Deno.FileInfo> => {
            const info = await originalLstat(...args);
            controller.abort();
            return info;
        };
        try {
            await expect(selectFiles(root, root, ['.'], false, controller.signal))
                .rejects.toThrow();
        } finally {
            Deno.lstat = originalLstat;
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('selectFiles ignores non-regular entries and propagates filesystem errors', async () => {
    const root = await Deno.makeTempDir();
    const originalLstat = Deno.lstat;
    try {
        await Deno.writeTextFile(join(root, 'special'), '');
        Deno.lstat = async (...args): Promise<Deno.FileInfo> => ({
            ...await originalLstat(...args),
            isFile: false,
            isDirectory: false,
        });
        expect(await selectFiles(root, root, ['special'], false, new AbortController().signal))
            .toEqual([]);
        Deno.lstat = (): Promise<Deno.FileInfo> =>
            Promise.reject(new Deno.errors.PermissionDenied());
        await expect(selectFiles(root, root, ['special'], false, new AbortController().signal))
            .rejects.toBeInstanceOf(Deno.errors.PermissionDenied);
    } finally {
        Deno.lstat = originalLstat;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('selectFiles merges Git changes within a nested project', async () => {
    const root = await Deno.makeTempDir();
    async function git(...args: string[]): Promise<void> {
        const result = await new Deno.Command('git', { cwd: root, args }).output();
        if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
    }
    try {
        await git('init');
        await git('config', 'user.email', 'test@example.com');
        await git('config', 'user.name', 'Test');
        await Deno.mkdir(join(root, 'project/sub'), { recursive: true });
        for (const path of ['staged', 'unstaged', 'deleted', 'source']) {
            await Deno.writeTextFile(join(root, 'project', path), 'initial');
        }
        await git('add', '.');
        await git('commit', '-m', 'initial');
        await Deno.writeTextFile(join(root, 'project/staged'), 'changed');
        await git('add', '.');
        await Deno.writeTextFile(join(root, 'project/unstaged'), 'changed');
        await Deno.remove(join(root, 'project/deleted'));
        await git('mv', 'project/source', 'project/renamed');
        for (const path of ['space name', 'line\nname', 'tab\tname', 'quote"name']) {
            await Deno.writeTextFile(join(root, 'project', path), '');
        }
        await Deno.writeTextFile(join(root, 'outside'), '');
        await Deno.symlink(join(root, 'project/sub'), join(root, 'project/link'));
        expect(
            await selectFiles(
                join(root, 'project'),
                join(root, 'project/sub'),
                ['../staged'],
                true,
                new AbortController().signal,
            ),
        )
            .toEqual([
                'line\nname',
                'quote"name',
                'renamed',
                'space name',
                'staged',
                'tab\tname',
                'unstaged',
            ]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('selectFiles handles controlled Git records and subprocess failures', async () => {
    const root = await Deno.makeTempDir();
    const OriginalCommand = Deno.Command;
    let records = '';
    let failure = false;
    let launchError = false;
    let calls = 0;
    const controller = new AbortController();
    try {
        await Deno.writeTextFile(join(root, 'destination'), '');
        await Deno.writeTextFile(join(root, 'source'), '');
        await Deno.mkdir(join(root, 'directory'));
        await Deno.symlink(join(root, 'directory'), join(root, 'link'));
        Deno.Command = class extends OriginalCommand {
            constructor(command: string | URL, options?: Deno.CommandOptions) {
                super(command, options);
                expect(command).toBe('git');
                expect(options?.signal).toBe(controller.signal);
                calls++;
            }
            override output(): Promise<Deno.CommandOutput> {
                if (launchError) return Promise.reject(new Deno.errors.NotFound());
                const value = calls % 2 === 1 ? root + '\n' : records;
                return Promise.resolve({
                    success: !failure,
                    code: failure ? 1 : 0,
                    stdout: new TextEncoder().encode(value),
                    stderr: new TextEncoder().encode('git failure'),
                    signal: null,
                });
            }
        };
        records = 'C  destination\0source\0 R destination\0source\0' +
            '?? missing\0?? link/child\0?? directory\0 D source\0';
        expect(await selectFiles(root, root, [], true, controller.signal))
            .toEqual(['destination']);
        const originalLstat = Deno.lstat;
        Deno.lstat = (): Promise<Deno.FileInfo> =>
            Promise.reject(new Deno.errors.PermissionDenied());
        try {
            await expect(selectFiles(root, root, [], true, controller.signal))
                .rejects.toBeInstanceOf(Deno.errors.PermissionDenied);
        } finally {
            Deno.lstat = originalLstat;
        }
        failure = true;
        await expect(selectFiles(root, root, [], true, controller.signal))
            .rejects.toThrow('git failure');
        launchError = true;
        await expect(selectFiles(root, root, [], true, controller.signal))
            .rejects.toBeInstanceOf(Deno.errors.NotFound);
        controller.abort();
        await expect(selectFiles(root, root, [], true, controller.signal)).rejects.toThrow();
    } finally {
        Deno.Command = OriginalCommand;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('selectFiles requires a worktree only for changed selection', async () => {
    const root = await Deno.makeTempDir();
    try {
        const signal = new AbortController().signal;
        expect(await selectFiles(root, root, [], false, signal)).toEqual([]);
        await expect(selectFiles(root, root, [], true, signal)).rejects.toThrow();
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
