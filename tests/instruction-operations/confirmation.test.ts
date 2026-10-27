import { expect } from '@std/expect';
import { Confirmation } from '../../src/instruction-operations/confirmation.ts';

Deno.test('confirmation checks both terminals and defaults empty answers and EOF to decline', async () => {
    const input = Deno.stdin.isTerminal;
    const output = Deno.stdout.isTerminal;
    const ask = globalThis.prompt;
    try {
        for (const stdin of [false, true]) {
            for (const stdout of [false, true]) {
                Deno.stdin.isTerminal = (): boolean => stdin;
                Deno.stdout.isTerminal = (): boolean => stdout;
                expect(Confirmation.available()).toBe(stdin && stdout);
            }
        }
        for (const answer of [null, '', ' ', 'n', 'no', 'yeah', 'y', 'YES', ' yes ']) {
            globalThis.prompt = (message): string | null => {
                expect(message).toBe('Overwrite path? [y/N]');
                return answer;
            };
            expect(await Confirmation.ask('path')).toBe(
                ['y', 'YES', ' yes '].includes(answer ?? ''),
            );
        }
        globalThis.prompt = (message): string => {
            expect(message).toBe('Remove path? [y/N]');
            return '';
        };
        expect(await Confirmation.ask('path', 'Remove')).toBe(false);
    } finally {
        Deno.stdin.isTerminal = input;
        Deno.stdout.isTerminal = output;
        globalThis.prompt = ask;
    }
});
