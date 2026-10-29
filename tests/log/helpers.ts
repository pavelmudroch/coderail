import { context } from '../../src/log/helpers/context.ts';

export function captureOutput(): {
    stderr: string[];
    stdout: string[];
    [Symbol.dispose](): void;
} {
    const original = {
        context: { ...context },
        stderr: Deno.stderr.writeSync,
        stdout: Deno.stdout.writeSync,
        isTerminal: Deno.stderr.isTerminal,
        consoleSize: Deno.consoleSize,
    };
    const stderr: string[] = [];
    const stdout: string[] = [];
    const decoder = new TextDecoder();
    Deno.stderr.writeSync = (buffer): number => {
        stderr.push(decoder.decode(buffer));
        return buffer.length;
    };
    Deno.stdout.writeSync = (buffer): number => {
        stdout.push(decoder.decode(buffer));
        return buffer.length;
    };
    Deno.stderr.isTerminal = () => true;
    Deno.consoleSize = () => ({ columns: 20, rows: 24 });
    context.logLevel = 'normal';
    context.noColor = true;
    context.nonInteractive = false;
    context.currentLiveUiItem = null;
    return {
        stderr,
        stdout,
        [Symbol.dispose](): void {
            Deno.stderr.writeSync = original.stderr;
            Deno.stdout.writeSync = original.stdout;
            Deno.stderr.isTerminal = original.isTerminal;
            Deno.consoleSize = original.consoleSize;
            Object.assign(context, original.context);
        },
    };
}
