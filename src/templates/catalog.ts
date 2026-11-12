import { Conf } from '@conf';
import { join, resolve } from '@std/path';

export type TemplateInfo = { name: string; description: string; path: string };

function templatePath(installRoot: string, name: string): string {
    if (
        !name.trim() ||
        name === '.' ||
        name === '..' ||
        /[/\\:]/.test(name) ||
        name.includes(String.fromCharCode(0))
    ) {
        throw new Error(`Invalid template name "${name}".`);
    }
    return resolve(installRoot, 'templates', name);
}

export async function get(
    installRoot: string,
    name: string,
    signal: AbortSignal,
): Promise<TemplateInfo> {
    signal.throwIfAborted();
    const path = templatePath(installRoot, name);
    try {
        for (const [entry, directory] of [
            ['template', false],
            ['config', false],
            ['assets', true],
        ] as const) {
            signal.throwIfAborted();
            const stat = await Deno.lstat(join(path, entry));
            if (directory ? !stat.isDirectory : !stat.isFile) {
                throw new Error(`Invalid template entry "${entry}".`);
            }
        }
        // Refuse redirected template directories, keeping operations inside installation storage.
        if (!(await Deno.lstat(path)).isDirectory) {
            throw new Error('Invalid template directory.');
        }
        const metadata = await Conf.parse(
            new Blob([await Deno.readTextFile(join(path, 'template'), { signal })]).stream(),
        );
        const values = metadata.toObject();
        if (
            Object.keys(values).some((key) => key !== 'description') ||
            (values.description !== undefined && typeof values.description !== 'string')
        ) {
            throw new Error('Template metadata accepts only a string description.');
        }
        signal.throwIfAborted();
        return { name, description: (values.description as string | undefined) ?? '', path };
    } catch (error) {
        throw new Error(`Cannot read template "${name}" at "${path}".`, { cause: error });
    }
}

export async function list(installRoot: string, signal: AbortSignal): Promise<TemplateInfo[]> {
    signal.throwIfAborted();
    const entries: Deno.DirEntry[] = [];
    try {
        for await (const entry of Deno.readDir(resolve(installRoot, 'templates'))) {
            signal.throwIfAborted();
            entries.push(entry);
        }
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return [];
        }
        throw error;
    }
    signal.throwIfAborted();
    const result: TemplateInfo[] = [];
    for (const name of entries
        .filter((entry) => entry.isDirectory)
        .map((entry) => entry.name)
        .sort()) {
        result.push(await get(installRoot, name, signal));
    }
    return result;
}

export async function create(
    installRoot: string,
    name: string,
    description: string,
    signal: AbortSignal,
): Promise<TemplateInfo> {
    signal.throwIfAborted();
    const path = templatePath(installRoot, name);
    await Deno.mkdir(resolve(installRoot, 'templates'), { recursive: true });
    signal.throwIfAborted();
    await Deno.mkdir(path);
    signal.throwIfAborted();
    await Deno.mkdir(join(path, 'assets'));
    signal.throwIfAborted();
    await Deno.writeTextFile(join(path, 'config'), '', { signal });
    await Deno.writeTextFile(
        join(path, 'template'),
        Conf.stringify({ values: { description }, comments: new Map() }),
        { signal },
    );
    signal.throwIfAborted();
    return { name, description, path };
}

export async function remove(
    installRoot: string,
    name: string,
    signal: AbortSignal,
): Promise<TemplateInfo> {
    const info = await get(installRoot, name, signal);
    signal.throwIfAborted();
    await Deno.remove(info.path, { recursive: true });
    return info;
}
