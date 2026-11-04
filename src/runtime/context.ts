import type { Command, GlobalArguments } from '@commands';
import { Log } from '@log';
import { dirname, fromFileUrl, join, resolve } from '@std/path';

export type RuntimeContext = {
    currentWorkingDirectory: string;
    installRoot: string;
    /** Flattened distribution root, or repository assets during source development. */
    resourceRoot?: string;
    repositoryRoot?: string;
};

/** Resolves runtime paths without changing the process working directory. */
export async function createContext(
    global: GlobalArguments,
    command: Pick<Command, 'requiresInit'>,
): Promise<RuntimeContext> {
    const currentWorkingDirectory = resolve(Deno.cwd(), global.cwd ?? '.');
    if (!(await Deno.stat(currentWorkingDirectory)).isDirectory) {
        throw new Error(`Working directory "${currentWorkingDirectory}" is not a directory.`);
    }

    Log.notice(`Resolving runtime context for working directory "${currentWorkingDirectory}".`);
    const entryPath = Deno.build.standalone ? Deno.execPath() : fromFileUrl(Deno.mainModule);
    const installRoot = dirname(dirname(await Deno.realPath(entryPath)));
    Log.notice(`Resolved install root at "${installRoot}".`);
    // Upgrade helpers must preserve libexec/<executable> beneath the physical install root.
    // Discovery needs neither a manifest nor a launcher, including during bootstrap.
    const resourceRoot = Deno.build.standalone ? installRoot : join(installRoot, 'assets');
    const repositoryRoot = await findRepositoryRoot(currentWorkingDirectory);
    if (repositoryRoot !== undefined) {
        Log.notice(`Resolved repository root at "${repositoryRoot}".`);
    }

    if (repositoryRoot === undefined && command.requiresInit) {
        throw new Error(
            `No initialized project found from "${currentWorkingDirectory}". Run "cr init" first.`,
        );
    }

    return { currentWorkingDirectory, installRoot, resourceRoot, repositoryRoot };
}

/** Finds the nearest .coderail directory, including at the filesystem root. */
async function findRepositoryRoot(directory: string): Promise<string | undefined> {
    while (true) {
        try {
            if ((await Deno.stat(join(directory, '.coderail'))).isDirectory) {
                return directory;
            }
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
        }

        const parent = dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}
