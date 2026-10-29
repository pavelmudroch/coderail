import { expect } from '@std/expect';
import { trace } from '../../src/log/trace.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('trace writes stack traces and error details to stderr before redrawing', () => {
    using captured = captureOutput();
    const original = Error.captureStackTrace;
    Error.captureStackTrace = (target): void => {
        Object.assign(target, { stack: 'Error\n\n at task (file:///task.ts:12:3)\n at native' });
    };
    try {
        const error = new Error('broken');
        error.stack = 'Error: broken\n at file:///task.ts:2:1';
        const noStack = new Error('no stack');
        noStack.stack = undefined;
        let redraws = 0;
        context.currentLiveUiItem = {
            redraw(): void {
                expect(captured.stderr).toHaveLength(1);
                redraws++;
            },
            [Symbol.dispose](): void {},
        };
        trace('hello', error, noStack);
        expect(captured.stderr).toEqual([
            'trace: hello: broken: no stack\n\x1b[0K > at task (file:///task.ts:12:3)' +
            '\n\x1b[0K > at native\n\x1b[0K   Error: broken' +
            '\n\x1b[0K    > at file:///task.ts:2:1\x1b[0K\n',
        ]);
        expect(redraws).toBe(1);
        expect(captured.stdout).toEqual([]);
        context.currentLiveUiItem = null;
        context.noColor = false;
        trace('hello', error);
        expect(captured.stderr.at(-1)).toContain('\x1b[35mtrace: hello: broken\x1b[0m');
        expect(captured.stderr.at(-1)).toContain('\x1b[36mat native\x1b[0m');
        expect(captured.stderr.at(-1)).toContain('\x1b[32mfile:///task.ts\x1b[0m');
        expect(captured.stderr.at(-1)).toContain('\x1b[31mError: broken\x1b[0m');
        Error.captureStackTrace = (): void => {};
        trace();
        expect(captured.stderr.at(-1)).toBe('\x1b[35mtrace: \x1b[0m\x1b[0K\n');
    } finally {
        Error.captureStackTrace = original;
    }
});
