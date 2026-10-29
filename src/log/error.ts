import { writeSync } from './helpers/write-sync.ts';
import { clear, red } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function error(...messages: unknown[]): void {
    const messageString = `${red('error:')} ${stringifyMessages(messages)}`;
    writeSync(Deno.stderr, `${messageString}${clear()}\n`);
    context.currentLiveUiItem?.redraw();
}
