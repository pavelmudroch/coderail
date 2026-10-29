import { writeSync } from './helpers/write-sync.ts';
import { context } from './helpers/context.ts';
import { clear } from './helpers/ansi.ts';
import { warn } from './warn.ts';

export type ConfirmOptions = {
    yes?: string[];
    no?: string[];
    default?: boolean;
};

export function confirm(message: string, options?: ConfirmOptions): boolean {
    if (context.nonInteractive) {
        return false;
    }

    const yes = options?.yes ?? [options?.default === true ? 'Y' : 'y'];
    const no = options?.no ?? [options?.default === false ? 'N' : 'n'];

    const decoder = new TextDecoder();
    const byte = new Uint8Array(1);

    const prompt = `${message} [${yes.join('/')}/${no.join('/')}]: `;

    while (true) {
        writeSync(Deno.stderr, `${prompt}${clear()}`);

        const bytes: number[] = [];
        while (true) {
            if (Deno.stdin.readSync(byte) === null) {
                return false;
            }
            if (byte[0] === 10) {
                break;
            }
            bytes.push(...byte);
        }

        const answer = decoder.decode(new Uint8Array(bytes)).trim().toLowerCase();
        if (answer === '') {
            if (options?.default !== undefined) {
                return options.default;
            }
        } else {
            if (yes.some((sample) => sample.toLowerCase() === answer)) {
                return true;
            }
            if (no.some((sample) => sample.toLowerCase() === answer)) {
                return false;
            }
        }

        warn('Invalid choice.');
    }
}
