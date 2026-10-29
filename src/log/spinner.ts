import { writeSync } from './helpers/write-sync.ts';
import { dim, erase, magenta } from './helpers/ansi.ts';
import { type LiveUI, registerLiveUiItem, unregisterLiveUiItem } from './helpers/context.ts';
import { context } from './helpers/context.ts';

export interface Spinner extends Disposable {
    /**
     * Sets the message displayed next to the spinner.
     * @param message A message to display.
     */
    setMessage(message: string): void;
    /**
     * Adds a step to the spinner with the given message.
     * @param message A message of the step to display
     */
    addStep(message: string): void;
}
export class SpinnerImpl implements Spinner, LiveUI {
    readonly #steps: string[] = [];
    readonly #spinnerFrames = ['⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠋'] as const;
    readonly #intervalId?: ReturnType<typeof setInterval>;
    #currentFrame = 0;
    #message: string = '';
    #disposed: boolean = false;

    constructor() {
        if (context.nonInteractive) {
            this.#disposed = true;
            return;
        }

        registerLiveUiItem(this);
        this.#intervalId = setInterval(() => {
            this.#currentFrame = (this.#currentFrame + 1) % this.#spinnerFrames.length;
            this.redraw();
        }, 100);
        this.redraw();
    }

    setMessage(message: string): void {
        this.#message = message;
        this.redraw();
    }

    addStep(message: string): void {
        this.#steps.push(`   > ${message}`);
        if (this.#steps.length > 5) {
            this.#steps.shift();
        }
        this.redraw();
    }

    [Symbol.dispose](): void {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        clearInterval(this.#intervalId);
        unregisterLiveUiItem(this);
        writeSync(Deno.stderr, `\r${erase()}`);
    }

    redraw(): void {
        if (this.#disposed) {
            return;
        }

        // deno-lint-ignore no-non-null-assertion -- bounds checked by modulo operation
        const frame = this.#spinnerFrames[this.#currentFrame]!;
        const lines: string[] = [];
        const terminalWidth = Deno.consoleSize().columns;
        {
            let remainingLength = this.#message.length;
            let currentIndex = 0;
            lines.push(
                ` ${magenta(frame)} ${this.#message.slice(currentIndex, terminalWidth - 3)}`,
            );
            remainingLength -= terminalWidth - 3;
            currentIndex += terminalWidth - 3;
            while (remainingLength > 0) {
                lines.push(
                    `   ${this.#message.slice(currentIndex, currentIndex + terminalWidth - 3)}`,
                );
                currentIndex += terminalWidth - 3;
                remainingLength -= terminalWidth - 3;
            }
        }
        for (const step of this.#steps) {
            let remainingLength = step.length;
            let currentIndex = 0;
            lines.push(dim(step.slice(currentIndex, terminalWidth)));
            remainingLength -= terminalWidth;
            currentIndex += terminalWidth;
            while (remainingLength > 0) {
                lines.push(
                    dim('     ' + step.slice(currentIndex, currentIndex + terminalWidth - 5)),
                );
                currentIndex += terminalWidth - 5;
                remainingLength -= terminalWidth - 5;
            }
        }
        const returnToStart = lines.length > 1 ? `\x1b[${lines.length - 1}F` : '\r';
        writeSync(Deno.stderr, `\r${erase()}${lines.join('\r\n')}${returnToStart}`);
    }
}
