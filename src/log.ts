import { type Progress, ProgressImpl } from './log/progress.ts';
import { type Spinner, SpinnerImpl } from './log/spinner.ts';
import { context } from './log/helpers/context.ts';
import { notice } from './log/notice.ts';
import { info } from './log/info.ts';
import { warn } from './log/warn.ts';
import { error } from './log/error.ts';
import { output } from './log/output.ts';
import { cyan, dim, gray, green, magenta, orange, red, yellow } from './log/helpers/ansi.ts';

export type { Progress };
export type { Spinner };

export interface Color {
    /**
     * Colors the given text in cyan.
     * @param text The text to colorize.
     * @returns The text colored in cyan.
     */
    cyan(text: string): string;
    /**
     * Colors the given text in red.
     * @param text The text to colorize.
     * @returns The text colored in red.
     */
    red(text: string): string;
    /**
     * Colors the given text in green.
     * @param text The text to colorize.
     * @returns The text colored in green.
     */
    green(text: string): string;
    /**
     * Colors the given text in yellow.
     * @param text The text to colorize.
     * @returns The text colored in yellow.
     */
    yellow(text: string): string;
    /**
     * Colors the given text in magenta.
     * @param text The text to colorize.
     * @returns The text colored in magenta.
     */
    magenta(text: string): string;
    /**
     * Colors the given text in gray.
     * @param text The text to colorize.
     * @returns The text colored in gray.
     */
    gray(text: string): string;
    /**
     * Colors the given text in orange.
     * @param text The text to colorize.
     * @returns The text colored in orange.
     */
    orange(text: string): string;
    /**
     * Colors the given text in dim.
     * @param text The text to colorize.
     * @returns The text colored in dim.
     */
    dim(text: string): string;
}

export interface Log {
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
    /** A set of utilities to colorize text. */
    color: Color;
}

export const Log: Log = {
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
    color: {
        cyan,
        red,
        green,
        yellow,
        magenta,
        gray,
        orange,
        dim,
    },
};

if (!Deno.build.standalone) {
    const traceModulePath = './log/trace.ts';
    const traceModule = await import(traceModulePath);
    Log.trace = traceModule.trace;
}
