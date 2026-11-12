import { join } from '@std/path';

/** Selects at most one startup script, preferring the current platform over TypeScript. */
export async function select(
    templateRoot: string,
    platform: string,
    signal: AbortSignal,
): Promise<string | undefined> {
    signal.throwIfAborted();
    const entries = await Array.fromAsync(Deno.readDir(templateRoot));
    signal.throwIfAborted();
    for (const name of [platform === 'windows' ? 'startup.ps1' : 'startup.sh', 'startup.ts']) {
        const entry = entries.find((entry) => entry.name === name);
        if (entry) {
            if (!entry.isFile) {
                throw new Error(
                    `Expected startup script "${join(templateRoot, name)}" to be a file.`,
                );
            }
            return join(templateRoot, name);
        }
    }
    return undefined;
}

/** Runs a selected script to completion; cancellation terminates and reaps the child. */
export async function run(path: string, projectRoot: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const [command, args] = path.endsWith('.sh')
        ? ['sh', [path]]
        : path.endsWith('.ps1')
          ? ['pwsh', ['-File', path]]
          : ['deno', ['run', '-A', path]];
    const child = new Deno.Command(command, {
        args,
        cwd: projectRoot,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
        signal,
    }).spawn();
    const status = await child.status;
    signal.throwIfAborted();
    if (!status.success) {
        throw new Error(`Startup script "${path}" exited with code ${status.code}.`);
    }
}
