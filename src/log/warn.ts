import { clear, yellow } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function warn(...messages: unknown[]): void {
    if (context.logLevel === 'quiet') {
        return;
    }

    const messageString = `${yellow('warn:')} ${stringifyMessages(messages)}`;
    console.warn(messageString, clear());
    context.currentLiveUiItem?.redraw();
}
