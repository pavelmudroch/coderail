import { Log } from '@log';
import { join, parse, resolve, SEPARATOR } from '@std/path';

import type { CompiledRule } from './compile-rules.ts';

export type CommandResult = {
    command: string[];
    status: 'ok' | 'fail' | 'planned';
    output: string;
};

export type FileResult = {
    path: string;
    status: CommandResult['status'] | 'skipped';
    commands: CommandResult[];
};

export type CommandNotifications = {
    onStart: (command: string[]) => void;
    onLine: (line: string) => void;
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
            if (index === parts.length - 1) {
                return info.isFile;
            }
            if (!info.isDirectory) {
                return false;
            }
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
    dry = false,
    notifications?: CommandNotifications,
): Promise<{ uniqueCommands: number; failedFiles: number }> {
    const cache = new Map<string, CommandResult>();
    let uniqueCommands = 0;
    let failedFiles = 0;
    signal.throwIfAborted();
    for (const path of files) {
        Log.notice(`Checking file "${path}"`);
        const result: FileResult = { path, status: 'skipped', commands: [] };
        for (const rule of rules) {
            signal.throwIfAborted();
            const expanded = rule.match(path);
            if (!expanded) {
                continue;
            }
            let available = true;
            for (const required of expanded.requires) {
                if (!(await isRequiredFile(resolve(root, required), signal))) {
                    available = false;
                    break;
                }
            }
            if (!available) {
                continue;
            }
            for (const command of expanded.commands) {
                signal.throwIfAborted();
                const [executable] = command;
                if (executable === undefined) {
                    continue;
                }
                const key = JSON.stringify(command);
                let outcome = cache.get(key);
                if (!outcome) {
                    outcome = await executeCommand(root, command, signal, dry, notifications);
                    cache.set(key, outcome);
                    uniqueCommands++;
                }
                result.commands.push(outcome);
                result.status = outcome.status;
                if (outcome.status === 'fail') {
                    break;
                }
            }
            if (result.status === 'fail') {
                break;
            }
        }
        signal.throwIfAborted();
        if (result.status === 'fail') {
            failedFiles++;
        }
        report(result);
    }
    return { uniqueCommands, failedFiles };
}

export async function executeCommand(
    root: string,
    command: string[],
    signal: AbortSignal,
    dry = false,
    notifications?: CommandNotifications,
): Promise<CommandResult> {
    signal.throwIfAborted();
    const [executable, ...args] = command;
    if (executable === undefined) {
        throw new Error('Cannot execute an empty command');
    }
    if (dry) {
        return { command, status: 'planned', output: '' };
    }
    try {
        const options = {
            args,
            cwd: root,
            stdin: 'null',
            stdout: 'piped',
            stderr: 'piped',
        } as const satisfies Deno.CommandOptions;
        if (notifications) {
            const streaming = new AbortController();
            const childSignal = AbortSignal.any([signal, streaming.signal]);
            notifications.onStart(command);
            signal.throwIfAborted();
            const child = new Deno.Command(executable, { ...options, signal: childSignal }).spawn();
            const completion = [
                child.status,
                streamLines(child.stdout, notifications.onLine, childSignal),
                streamLines(child.stderr, notifications.onLine, childSignal),
            ] as const;
            try {
                const [status] = await Promise.all(completion);
                signal.throwIfAborted();
                return { command, status: status.success ? 'ok' : 'fail', output: '' };
            } catch (error) {
                streaming.abort();
                await Promise.allSettled(completion);
                throw error;
            }
        }
        const output = await new Deno.Command(executable, { ...options, signal }).output();
        signal.throwIfAborted();
        const decoder = new TextDecoder();
        return {
            command,
            status: output.success ? 'ok' : 'fail',
            output: decoder.decode(output.stdout) + decoder.decode(output.stderr),
        };
    } catch (error) {
        signal.throwIfAborted();
        return { command, status: 'fail', output: String(error) };
    }
}

function streamLines(
    pipe: ReadableStream<Uint8Array>,
    onLine: CommandNotifications['onLine'],
    signal: AbortSignal,
): Promise<void> {
    let pending = '';
    return pipe.pipeThrough(new TextDecoderStream()).pipeTo(
        new WritableStream<string>({
            write(chunk) {
                let start = 0;
                for (let end = chunk.indexOf('\n'); end !== -1; end = chunk.indexOf('\n', start)) {
                    const line = pending + chunk.slice(start, end);
                    onLine(line.replace(/\r$/, ''));
                    pending = '';
                    start = end + 1;
                }
                pending += chunk.slice(start);
            },
            close() {
                if (pending.length > 0) {
                    onLine(pending);
                }
            },
        }),
        { signal },
    );
}
