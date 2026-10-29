import { writeSync } from './helpers/write-sync.ts';
import {
    context,
    type LiveUI,
    registerLiveUiItem,
    unregisterLiveUiItem,
} from './helpers/context.ts';
import { erase } from './helpers/ansi.ts';

export interface Progress extends Disposable {
    /**
     * Sets the message displayed next to the progress indicator.
     * @param message A message to display.
     */
    setMessage(message: string): void;
    /**
     * Sets the progress value.
     * @param progress A number representing the progress (`0` to `100`).
     */
    setProgress(progress: number): void;
}

export class ProgressImpl implements Progress, LiveUI {
    #currentProgress = 0;
    #currentMessage = '';
    #disposed = false;

    constructor() {
        if (context.nonInteractive) {
            this.#disposed = true;
            return;
        }
        registerLiveUiItem(this);
    }

    setMessage(message: string): void {
        this.#currentMessage = message;
        this.redraw();
    }

    setProgress(progress: number): void {
        this.#currentProgress = Math.min(Math.max(progress, 0), 100);
        this.redraw();
    }

    [Symbol.dispose](): void {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        unregisterLiveUiItem(this);
        writeSync(Deno.stderr, `\r${erase()}`);
    }

    redraw(): void {
        if (this.#disposed) {
            return;
        }

        const terminalWidth = Deno.consoleSize().columns;
        const lines: string[] = [];
        {
            let remainingLength = this.#currentMessage.length;
            let currentIndex = 0;
            while (remainingLength > 0) {
                lines.push(this.#currentMessage.slice(currentIndex, currentIndex + terminalWidth));
                currentIndex += terminalWidth;
                remainingLength -= terminalWidth;
            }
        }
        const percentage = this.#currentProgress.toFixed(2).padStart(7, ' ') + '%';
        const progressSpace = Math.floor(terminalWidth - (2 + percentage.length));
        const progressAdvanced = Math.round((this.#currentProgress / 100) * progressSpace);
        const progressBar = '[' + '='.repeat(progressAdvanced) +
            ' '.repeat(progressSpace - progressAdvanced) + ']' + percentage;
        lines.push(progressBar);
        const returnToStart = lines.length > 1 ? `\x1b[${lines.length - 1}F` : '\r';
        writeSync(Deno.stderr, `\r${erase()}${lines.join('\r\n')}${returnToStart}`);
    }
}
