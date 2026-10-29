import { info } from '../../src/log/info.ts';
import { Terminal } from './terminal.ts';
import { expect } from '@std/expect';
import { SpinnerImpl } from '../../src/log/spinner.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('spinner writes frames, wrapped messages, steps and disposal to stderr', () => {
    using captured = captureOutput();
    const original = { setInterval, clearInterval };
    let tick = (): void => {};
    let cleared = 0;
    const intervalId = {} as ReturnType<typeof setInterval>;
    globalThis.setInterval =
        ((callback: () => void, delay?: number): ReturnType<typeof setInterval> => {
            expect(delay).toBe(100);
            tick = callback;
            return intervalId;
        }) as typeof setInterval;
    globalThis.clearInterval = (id): void => {
        expect(id).toBe(intervalId);
        cleared++;
    };
    try {
        using spinner = new SpinnerImpl();
        expect(context.currentLiveUiItem).toBe(spinner);
        expect(captured.stderr).toEqual(['\r\x1b[0J ⠙ \r']);
        spinner.setMessage('123456789012345678');
        expect(captured.stderr.at(-1)).toBe(
            '\r\x1b[0J ⠙ 12345678901234567\r\n   8\x1b[1F',
        );
        spinner.setMessage('Loading');
        tick();
        expect(captured.stderr.at(-1)).toBe('\r\x1b[0J ⠹ Loading\r');
        for (let index = 0; index < 9; index++) tick();
        expect(captured.stderr.at(-1)).toBe('\r\x1b[0J ⠙ Loading\r');
        spinner.addStep('123456789012345678901');
        expect(captured.stderr.at(-1)).toBe(
            '\r\x1b[0J ⠙ Loading\r\n   > 123456789012345\r\n     678901\x1b[2F',
        );
        for (const step of ['two', 'three', 'four', 'five', 'six']) spinner.addStep(step);
        expect(captured.stderr.at(-1)).toBe(
            '\r\x1b[0J ⠙ Loading\r\n   > two\r\n   > three\r\n   > four' +
                '\r\n   > five\r\n   > six\x1b[5F',
        );
        context.noColor = false;
        spinner.redraw();
        expect(captured.stderr.at(-1)).toContain('\x1b[35m⠙\x1b[0m');
        expect(captured.stderr.at(-1)).toContain('\x1b[2m   > two\x1b[0m');
        spinner[Symbol.dispose]();
        expect(cleared).toBe(1);
        expect(context.currentLiveUiItem).toBeNull();
        expect(captured.stderr.at(-1)).toBe('\r\x1b[0J');
        const count = captured.stderr.length;
        spinner.redraw();
        spinner[Symbol.dispose]();
        expect(captured.stderr).toHaveLength(count);
        expect(captured.stdout).toEqual([]);
    } finally {
        globalThis.setInterval = original.setInterval;
        globalThis.clearInterval = original.clearInterval;
    }
});

Deno.test('spinner stays silent in non-interactive mode', () => {
    using captured = captureOutput();
    context.nonInteractive = true;
    using spinner = new SpinnerImpl();
    spinner.setMessage('Hidden');
    spinner.addStep('Hidden');
    spinner.redraw();
    expect(context.currentLiveUiItem).toBeNull();
    expect(captured.stderr).toEqual([]);
    expect(captured.stdout).toEqual([]);
});

Deno.test('spinner redraws stay anchored, clear shorter frames and preserve interleaved logs', () => {
    using captured = captureOutput();
    for (const initial of ['', 'one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n']) {
        const terminal = new Terminal(20, 6);
        terminal.write(initial);
        captured.stderr.length = 0;
        using spinner = new SpinnerImpl();
        spinner.setMessage('123456789012345678');
        terminal.write(captured.stderr.splice(0).join(''));
        const startRow = initial === '' ? 0 : 4;
        expect(terminal.row).toBe(startRow);
        expect(terminal.column).toBe(0);
        expect(terminal.screen[startRow]).toBe(' ⠙ 12345678901234567');
        expect(terminal.screen[startRow + 1]).toBe('   8');
        expect(terminal.screen.slice(0, startRow)).toEqual(
            initial === '' ? [] : ['two', 'three', 'four', 'five'],
        );
        for (let index = 0; index < 3; index++) {
            spinner.redraw();
            terminal.write(captured.stderr.splice(0).join(''));
            expect(terminal.row).toBe(startRow);
            expect(terminal.column).toBe(0);
        }
        spinner.setMessage('Ready');
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe(' ⠙ Ready');
        expect(terminal.screen.slice(startRow + 1).every((line) => line === '')).toBe(true);
        info('Saved');
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe('Saved');
        expect(terminal.screen[startRow + 1]).toBe(' ⠙ Ready');
        expect(terminal.row).toBe(startRow + 1);
        expect(terminal.column).toBe(0);
        spinner[Symbol.dispose]();
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe('Saved');
        expect(terminal.screen.slice(startRow + 1).every((line) => line === '')).toBe(true);
        expect(terminal.row).toBe(startRow + 1);
        expect(terminal.column).toBe(0);
    }
});
