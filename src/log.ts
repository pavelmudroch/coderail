import { type Progress, ProgressImpl } from './log/progress.ts';
import { type Spinner, SpinnerImpl } from './log/spinner.ts';
import { context } from './log/helpers/context.ts';
import { notice } from './log/notice.ts';
import { info } from './log/info.ts';
import { warn } from './log/warn.ts';
import { error } from './log/error.ts';
import { output } from './log/output.ts';
import { configureLogging } from './log/configure.ts';
import type { Configuration } from '@conf';

export type { Progress };
export type { Spinner };

export interface Log {
    configureLogging(configuration: Configuration): void;
    /**
     * A settable current log level. (default: `'normal'`)
     */
    level: 'quiet' | 'normal' | 'verbose';
    /**
     * Whether to disable colored output in the logs.
     */
    noColor: boolean;
    /**
     * Whether to run in non-interactive mode.
     */
    nonInteractive: boolean;
    /**
     * Logs a trace message to stderr.
     * @param messages A messages to display
     *
     * **Important**: This is only intended for internal debugging purposes, thus will be no-op in production.
     */
    trace(...messages: unknown[]): void;
    /**
     * Logs a notice message to stderr.
     * @param messages A messages to display
     */
    notice(...messages: unknown[]): void;
    /**
     * Logs an info message to stderr.
     * @param messages A messages to display
     */
    info(...messages: unknown[]): void;
    /**
     * Logs a warning message to stderr.
     * @param messages A messages to display
     */
    warn(...messages: unknown[]): void;
    /**
     * Logs an error message to stderr.
     * @param messages A messages to display
     */
    error(...messages: unknown[]): void;
    /**
     * Logs an output message to stdout.
     * @param messages A messages to display
     */
    output(...messages: unknown[]): void;
    /**
     * Creates a progress indicator to stderr.
     * @param message A message to display
     */
    progress(message: string): Progress;
    /**
     * Creates a spinner to stderr.
     * @param message A message to display
     */
    spinner(message: string): Spinner;
}

export const Log: Log = {
    configureLogging,
    get level() {
        return context.logLevel;
    },
    set level(value) {
        context.logLevel = value;
    },
    get noColor() {
        return context.noColor;
    },
    set noColor(value) {
        context.noColor = value;
    },
    get nonInteractive() {
        return context.nonInteractive;
    },
    set nonInteractive(value) {
        context.nonInteractive = value;
    },
    trace: (..._messages: unknown[]) => {},
    notice,
    info,
    warn,
    error,
    output,
    progress: (message: string) => {
        const progress = new ProgressImpl();
        progress.setMessage(message);
        return progress;
    },
    spinner: (message: string) => {
        const spinner = new SpinnerImpl();
        spinner.setMessage(message);
        return spinner;
    },
};

if (!Deno.build.standalone) {
    const traceModulePath = './log/trace.ts';
    const traceModule = await import(traceModulePath);
    Log.trace = traceModule.trace;
}
