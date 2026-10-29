import { expect } from '@std/expect';
import { info } from '../../src/log/info.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('info writes formatted lines to stderr and respects log levels', () => {
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
                            expect(captured.stderr).toHaveLength(1);
                            redraws++;
                        },
                        [Symbol.dispose](): void {},
                    }
                    : null;
                info('hello', 42);
                const enabled = level !== 'quiet';
                const message = noColor ? 'hello: 42' : 'hello: 42';
                expect(captured.stderr).toEqual(enabled ? [`${message}\x1b[0K\n`] : []);
                expect(captured.stdout).toEqual([]);
                expect(redraws).toBe(enabled && live ? 1 : 0);
            }
        }
    }
});
