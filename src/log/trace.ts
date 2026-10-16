import { context } from './helpers/context.ts';
import { clear, cyan, dim, green, magenta, red } from './helpers/ansi.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function trace(...messages: unknown[]): void {
    const obj: { stack?: string } = {};
    Error.captureStackTrace(obj, trace);

    const messageHeader = magenta(`trace: ${stringifyMessages(messages)}`);
    const messageLines = [messageHeader];
    messageLines.push(...formatStack(obj.stack));
    let prefix = '   ';
    for (const message of messages) {
        if (message instanceof Error && message.stack !== undefined) {
            messageLines.push(prefix + red(`${message.name}: ${message.message}`));
            messageLines.push(...formatStack(message.stack).map((line) => `${prefix}${line}`));
            prefix = prefix + prefix;
        }
    }

    console.warn(messageLines.join(`\n${clear()}`), clear());
    context.currentLiveUiItem?.redraw();
}

function formatStack(stack?: string): string[] {
    const stackLines = stack?.split('\n') ?? [];
    const messageLines: string[] = [];
    for (const stackLine of stackLines) {
        const normalizedStackLine = stackLine.trim();
        if (normalizedStackLine === '' || normalizedStackLine.startsWith('Error')) {
            continue;
        }
        messageLines.push(colorizeStackLine(normalizedStackLine));
    }
    return messageLines;
}

function colorizeStackLine(stackLine: string): string {
    if (context.noColor) {
        return ` > ${stackLine}`;
    }

    const match = /:(\d+):(\d+)(\)?)$/.exec(stackLine);
    if (match === null) {
        return cyan(stackLine);
    }

    const location = match[0] ?? '';
    const line = match[1] ?? '';
    const column = match[2] ?? '';
    const closingParenthesis = match[3] ?? '';
    const locationStart = stackLine.length - location.length;
    const pathStart = stackLine.lastIndexOf('(', locationStart) + 1 || stackLine.indexOf('at ') + 3;
    const prefix = stackLine.slice(0, pathStart);
    const path = stackLine.slice(pathStart, locationStart);

    return `${dim(' > ')}${cyan(prefix)}${green(path)}:${magenta(line)}:${magenta(column)}${
        closingParenthesis === '' ? '' : cyan(closingParenthesis)
    }`;
}
