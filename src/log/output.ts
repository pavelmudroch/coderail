import { clear } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function output(...messages: unknown[]): void {
    const message = stringifyMessages(messages);
    console.log(message, clear());
    context.currentLiveUiItem?.redraw();
}
