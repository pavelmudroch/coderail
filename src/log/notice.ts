import { writeSync } from './helpers/write-sync.ts';
import { clear, gray } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';

export function notice(...messages: unknown[]): void {
    if (context.logLevel !== 'verbose') {
        return;
    }

    const messageString = `notice: ${stringifyMessages(messages)}`;
    writeSync(Deno.stderr, `${gray(messageString)}${clear()}\n`);
    context.currentLiveUiItem?.redraw();
}
