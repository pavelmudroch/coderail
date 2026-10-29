import { expect } from '@std/expect';
import { notice } from '../../src/log/notice.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('notice writes formatted lines to stderr and respects log levels', () => {
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
                notice('hello', 42);
                const enabled = level === 'verbose';
                const message = noColor ? 'notice: hello: 42' : '\x1b[90mnotice: hello: 42\x1b[0m';
                expect(captured.stderr).toEqual(enabled ? [`${message}\x1b[0K\n`] : []);
                expect(captured.stdout).toEqual([]);
                expect(redraws).toBe(enabled && live ? 1 : 0);
            }
        }
    }
});
