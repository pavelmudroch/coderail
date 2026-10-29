import { writeSync } from './helpers/write-sync.ts';
import { clear } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function output(...messages: unknown[]): void {
    const message = stringifyMessages(messages);
    writeSync(Deno.stdout, `${message}${clear()}\n`);
    context.currentLiveUiItem?.redraw();
}
