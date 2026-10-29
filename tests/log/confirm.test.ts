import { expect } from '@std/expect';
import { confirm, type ConfirmOptions } from '../../src/log/confirm.ts';
import { context } from '../../src/log/helpers/context.ts';

Deno.test('confirm reads choices, retries invalid input and honors explicit defaults', () => {
    const original = {
        nonInteractive: context.nonInteractive,
        noColor: context.noColor,
        readSync: Deno.stdin.readSync,
        writeSync: Deno.stderr.writeSync,
    };
    try {
        context.nonInteractive = false;
        context.noColor = true;

        const cases: [string, ConfirmOptions | undefined, boolean, number][] = [
            ['Y\n', undefined, true, 0],
            ['n\n', undefined, false, 0],
            [' YES \r\n', { yes: ['y', 'Yes'], no: ['n', 'No'] }, true, 0],
            ['NO\n', { yes: ['y', 'Yes'], no: ['n', 'No'] }, false, 0],
            ['ANO\n', { yes: ['Ano'], no: ['Ne'] }, true, 0],
            ['É\n', { yes: ['é'] }, true, 0],
            ['wrong\nY\n', undefined, true, 1],
            ['\n \nn\n', undefined, false, 2],
            ['yes\ny\n', undefined, true, 1],
            ['\n', { default: true }, true, 0],
            [' \r\n', { default: false }, false, 0],
            ['bad\n\n', { default: true }, true, 1],
            ['n\n', { default: true }, false, 0],
            ['y\n', { default: false }, true, 0],
            ['n\n', { default: false }, false, 0],
            ['', { default: true }, false, 0],
        ];
        for (const [input, options, expected, retries] of cases) {
            const bytes = new TextEncoder().encode(input);
            let offset = 0;
            const writes: string[] = [];
            Deno.stdin.readSync = (buffer): number | null => {
                if (offset === bytes.length) {
                    return null;
                }
                buffer.set(bytes.subarray(offset, ++offset));
                return 1;
            };
            Deno.stderr.writeSync = (buffer): number => {
                writes.push(new TextDecoder().decode(buffer));
                return buffer.length;
            };

            expect(confirm('Continue?', options)).toBe(expected);
            const yes = options?.yes ?? [options?.default === true ? 'Y' : 'y'];
            const no = options?.no ?? [options?.default === false ? 'N' : 'n'];
            const prompt = `Continue? [${yes.join('/')}/${no.join('/')}]: \x1b[0K`;
            const warning = 'warn: Invalid choice.\x1b[0K\n';
            expect(writes).toEqual([
                ...Array.from({ length: retries }, () => [prompt, warning]).flat(),
                prompt,
            ]);
        }

        Deno.stdin.readSync = (): never => {
            throw new Error('Non-interactive confirmation must not read input');
        };
        Deno.stderr.writeSync = (): never => {
            throw new Error('Non-interactive confirmation must not print a prompt');
        };
        context.nonInteractive = true;
        expect(confirm('Continue?', { default: true })).toBe(false);
    } finally {
        context.nonInteractive = original.nonInteractive;
        context.noColor = original.noColor;
        Deno.stdin.readSync = original.readSync;
        Deno.stderr.writeSync = original.writeSync;
    }
});
