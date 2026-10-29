import { join, parse, resolve, SEPARATOR } from '@std/path';
import type { CompiledRule } from './compile-rules.ts';
import { Log } from '@log';

export type CommandResult = {
    command: string[];
    status: 'ok' | 'fail';
    output: string;
};

export type FileResult = {
    path: string;
    status: 'ok' | 'fail' | 'skipped';
    commands: CommandResult[];
};

async function isRequiredFile(path: string, signal: AbortSignal): Promise<boolean> {
    const root = parse(path).root;
    const parts = path.slice(root.length).split(SEPARATOR).filter(Boolean);
    let current = root;
    try {
        for (const [index, part] of parts.entries()) {
            signal.throwIfAborted();
            current = join(current, part);
            const info = await Deno.lstat(current);
            signal.throwIfAborted();
            if (index === parts.length - 1) return info.isFile;
            if (!info.isDirectory) return false;
        }
        return false;
    } catch (error) {
        signal.throwIfAborted();
        if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.NotADirectory) {
            return false;
        }
        throw error;
    }
}

export async function runChecks(
    root: string,
    files: string[],
    rules: CompiledRule[],
    signal: AbortSignal,
    report: (result: FileResult) => void,
): Promise<{ executedCommands: number; failedFiles: number }> {
    const cache = new Map<string, CommandResult>();
    let executedCommands = 0;
    let failedFiles = 0;
    signal.throwIfAborted();
    for (const path of files) {
        Log.notice(`Checking file "${path}"`);
        const result: FileResult = { path, status: 'skipped', commands: [] };
        for (const rule of rules) {
            signal.throwIfAborted();
            const expanded = rule.match(path);
            if (!expanded) continue;
            let available = true;
            for (const required of expanded.requires) {
                if (!await isRequiredFile(resolve(root, required), signal)) {
                    available = false;
                    break;
                }
            }
            if (!available) continue;
            for (const command of expanded.commands) {
                signal.throwIfAborted();
                const [executable, ...args] = command;
                if (executable === undefined) continue;
                const key = JSON.stringify(command);
                let outcome = cache.get(key);
                if (!outcome) {
                    try {
                        const output = await new Deno.Command(executable, {
                            args,
                            cwd: root,
                            signal,
                            stdin: 'null',
                            stdout: 'piped',
                            stderr: 'piped',
                        }).output();
                        signal.throwIfAborted();
                        const decoder = new TextDecoder();
                        outcome = {
                            command,
                            status: output.success ? 'ok' : 'fail',
                            output: decoder.decode(output.stdout) + decoder.decode(output.stderr),
                        };
                    } catch (error) {
                        signal.throwIfAborted();
                        outcome = { command, status: 'fail', output: String(error) };
                    }
                    cache.set(key, outcome);
                    executedCommands++;
                }
                result.commands.push(outcome);
                result.status = outcome.status;
                if (outcome.status === 'fail') break;
            }
            if (result.status === 'fail') break;
        }
        signal.throwIfAborted();
        if (result.status === 'fail') failedFiles++;
        report(result);
    }
    return { executedCommands, failedFiles };
}
