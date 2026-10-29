import { isAbsolute, join, relative, resolve, SEPARATOR } from '@std/path';

export async function selectFiles(
    root: string,
    cwd: string,
    paths: string[],
    changed: boolean,
    signal: AbortSignal,
): Promise<string[]> {
    root = resolve(root);
    const files = new Set<string>();
    async function walk(path: string): Promise<void> {
        signal.throwIfAborted();
        const info = await Deno.lstat(path);
        signal.throwIfAborted();
        if (info.isFile) files.add(relative(root, path).split(SEPARATOR).join('/'));
        else if (info.isDirectory) {
            for await (const entry of Deno.readDir(path)) {
                await walk(join(path, entry.name));
            }
        }
    }
    async function select(input: string, git = false): Promise<void> {
        signal.throwIfAborted();
        const path = resolve(cwd, input);
        const local = relative(root, path);
        if (isAbsolute(local) || local === '..' || local.startsWith(`..${SEPARATOR}`)) {
            if (git) return;
            throw new Error(`Path is outside the project: ${input}`);
        }
        let ancestor = root;
        let symlink = false;
        for (const part of local ? local.split(SEPARATOR) : []) {
            signal.throwIfAborted();
            ancestor = join(ancestor, part);
            const info = await Deno.lstat(ancestor);
            if (info.isSymlink) {
                symlink = true;
                break;
            }
        }
        if (!symlink) {
            if (git) {
                if ((await Deno.lstat(path)).isFile) {
                    files.add(local.split(SEPARATOR).join('/'));
                }
            } else await walk(path);
        }
    }
    for (const input of paths) await select(input);
    if (changed) {
        const git = async (args: string[], directory: string): Promise<string> => {
            signal.throwIfAborted();
            const result = await new Deno.Command('git', {
                args,
                cwd: directory,
                signal,
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            signal.throwIfAborted();
            if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
            return new TextDecoder().decode(result.stdout);
        };
        const worktree = (await git(['rev-parse', '--show-toplevel'], cwd)).replace(/\r?\n$/, '');
        const project = await Deno.realPath(root);
        const records = (await git(
            ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
            worktree,
        )).split('\0');
        for (let index = 0; index < records.length; index++) {
            signal.throwIfAborted();
            const record = records[index];
            if (!record) continue;
            const status = record.slice(0, 2);
            if (/[RC]/.test(status)) index++;
            if (status.includes('D')) continue;
            try {
                await select(
                    resolve(root, relative(project, resolve(worktree, record.slice(3)))),
                    true,
                );
            } catch (error) {
                if (!(error instanceof Deno.errors.NotFound)) throw error;
            }
        }
    }
    signal.throwIfAborted();
    return [...files].sort();
}
