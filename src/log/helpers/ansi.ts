import { context } from './context.ts';

const ANSI = {
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m',
    yellow: '\x1b[93m',
    orange: '\x1b[33m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    el: '\x1b[0K',
    ed: '\x1b[0J',
};

export function clear(): string {
    return ANSI.el;
}

export function erase(): string {
    return ANSI.ed;
}

export function cyan(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.cyan}${value}${ANSI.reset}`;
}

export function dim(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.dim}${value}${ANSI.reset}`;
}

export function green(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.green}${value}${ANSI.reset}`;
}

export function magenta(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.magenta}${value}${ANSI.reset}`;
}

export function yellow(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.yellow}${value}${ANSI.reset}`;
}

export function orange(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.orange}${value}${ANSI.reset}`;
}

export function gray(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.gray}${value}${ANSI.reset}`;
}

export function red(value: string): string {
    if (context.noColor) {
        return value;
    }

    return `${ANSI.red}${value}${ANSI.reset}`;
}
