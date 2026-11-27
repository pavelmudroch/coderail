import { expect } from '@std/expect';

import { context } from '../../src/log/helpers/context.ts';
import { output } from '../../src/log/output.ts';
import { captureOutput } from './helpers.ts';

Deno.test('output writes formatted lines to stdout and respects log levels', () => {
    using captured = captureOutput();
    for (const level of ['quiet', 'normal', 'verbose'] as const) {
        for (const noColor of [true, false]) {
            context.logLevel = level;
            context.noColor = noColor;
            output('hello', 42);
            expect(captured.stdout.splice(0)).toEqual(['hello: 42\n']);
            expect(captured.stderr).toEqual([]);
        }
    }
});

Deno.test('output clears and redraws the live display on stderr', () => {
    using captured = captureOutput();
    const originalStdoutIsTerminal = Deno.stdout.isTerminal;
    const data = { status: 'ready' };
    const json = JSON.stringify(data, null, 4);
    let redraws = 0;
    context.currentLiveUiItem = {
        redraw(): void {
            expect(captured.stderr).toEqual(['\r\x1b[0J']);
            expect(captured.stdout).toEqual([`${json}\n`]);
            redraws++;
        },
        [Symbol.dispose](): void {},
    };
    const writeStdout = Deno.stdout.writeSync;
    try {
        Deno.stdout.isTerminal = () => true;
        Deno.stdout.writeSync = (bytes) => {
            expect(captured.stderr).toEqual(['\r\x1b[0J']);
            expect(redraws).toBe(0);
            return writeStdout(bytes);
        };
        output(json);
        expect(redraws).toBe(1);
        Deno.stdout.writeSync = writeStdout;

        for (const [stdout, stderr] of [
            [false, true],
            [true, false],
        ] as const) {
            captured.stdout.length = 0;
            captured.stderr.length = 0;
            Deno.stdout.isTerminal = () => stdout;
            Deno.stderr.isTerminal = () => stderr;
            output(json);
            expect(JSON.parse(captured.stdout.join(''))).toEqual(data);
            expect(captured.stderr).toEqual([]);
            expect(redraws).toBe(1);
        }
    } finally {
        Deno.stdout.isTerminal = originalStdoutIsTerminal;
    }
});
