import { clear } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function info(...messages: unknown[]): void {
    if (context.logLevel === 'quiet') {
        return;
    }

    const messageString = stringifyMessages(messages);
    console.warn(messageString, clear());
    context.currentLiveUiItem?.redraw();
}
