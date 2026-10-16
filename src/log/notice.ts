import { clear, gray } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function notice(...messages: unknown[]): void {
    if (context.logLevel !== 'verbose') {
        return;
    }

    const messageString = `notice: ${stringifyMessages(messages)}`;
    console.warn(gray(messageString), clear());
    context.currentLiveUiItem?.redraw();
}
