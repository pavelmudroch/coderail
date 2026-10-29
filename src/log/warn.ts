import { writeSync } from './helpers/write-sync.ts';
import { clear, yellow } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function warn(...messages: unknown[]): void {
    if (context.logLevel === 'quiet') {
        return;
    }

    const messageString = `${yellow('warn:')} ${stringifyMessages(messages)}`;
    writeSync(Deno.stderr, `${messageString}${clear()}\n`);
    context.currentLiveUiItem?.redraw();
}
