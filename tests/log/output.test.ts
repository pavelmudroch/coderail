import { expect } from '@std/expect';
import { output } from '../../src/log/output.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('output writes formatted lines to stdout and respects log levels', () => {
    using captured = captureOutput();
    for (const level of ['quiet', 'normal', 'verbose'] as const) {
        for (const noColor of [true, false]) {
            for (const live of [false, true]) {
                captured.stderr.length = 0;
                captured.stdout.length = 0;
                context.logLevel = level;
                context.noColor = noColor;
                let redraws = 0;
                context.currentLiveUiItem = live
                    ? {
                        redraw(): void {
                            expect(captured.stdout).toHaveLength(1);
                            redraws++;
                        },
                        [Symbol.dispose](): void {},
                    }
                    : null;
                output('hello', 42);
                const enabled = true;
                const message = noColor ? 'hello: 42' : 'hello: 42';
                expect(captured.stdout).toEqual(enabled ? [`${message}\x1b[0K\n`] : []);
                expect(captured.stderr).toEqual([]);
                expect(redraws).toBe(enabled && live ? 1 : 0);
            }
        }
    }
});
