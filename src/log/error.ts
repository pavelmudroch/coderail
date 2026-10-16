import { clear, red } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function error(...messages: unknown[]): void {
    const messageString = `${red('error:')} ${stringifyMessages(messages)}`;
    console.error(messageString, clear());
    context.currentLiveUiItem?.redraw();
}
