import { erase } from './helpers/ansi.ts';
import { context } from './helpers/context.ts';
import { stringifyMessages } from './helpers/stringifyMessages.ts';
import { writeSync } from './helpers/write-sync.ts';

export function output(...messages: unknown[]): void {
    const message = stringifyMessages(messages);
    const liveUi = context.currentLiveUiItem;

    if (liveUi && Deno.stdout.isTerminal() && Deno.stderr.isTerminal()) {
        writeSync(Deno.stderr, `\r${erase()}`);
        writeSync(Deno.stdout, `${message}\n`);
        liveUi.redraw();
        return;
    }

    writeSync(Deno.stdout, `${message}\n`);
}
