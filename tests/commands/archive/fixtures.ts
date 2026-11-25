import type { Command } from '@commands';
import { dirname, fromFileUrl, join } from '@std/path';

import { captureOutput } from '../../log/helpers.ts';

const main = fromFileUrl(new URL('../../../src/main.ts', import.meta.url));

export async function git(root: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', { cwd: root, args }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout).trim();
}

export async function cli(
    root: string,
    ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
    const result = await cliOutput(root, ...args);
    const decoder = new TextDecoder();
    return {
        code: result.code,
        stdout: decoder.decode(result.stdout),
        stderr: decoder.decode(result.stderr),
    };
}

export function cliOutput(root: string, ...args: string[]): Promise<Deno.CommandOutput> {
    return crOutput(root, 'archive', ...args);
}

export function crOutput(root: string, ...args: string[]): Promise<Deno.CommandOutput> {
    return new Deno.Command(Deno.execPath(), {
        cwd: root,
        args: ['run', '-A', main, '--no-color', ...args],
    }).output();
}

export async function write(root: string, path: string, text: string): Promise<void> {
    const filename = join(root, path);
    await Deno.mkdir(dirname(filename), { recursive: true });
    await Deno.writeTextFile(filename, text);
}

export function runArchiveCommand(command: Command, root: string, args: string[]): Promise<void> {
    return command.run({
        context: { currentWorkingDirectory: root, installRoot: root },
        configuration: {
            logLevel: 'normal',
            noColor: true,
            nonInteractive: true,
            verify: { rules: [] },
        },
        signal: new AbortController().signal,
        parsedArguments: command.parseArguments(args),
    });
}

export async function archiveTextOutput(
    command: Command,
    root: string,
    ...args: string[]
): Promise<string> {
    using captured = captureOutput();
    await runArchiveCommand(command, root, args);
    return captured.stdout.join('').replaceAll('\x1b[0K', '');
}
