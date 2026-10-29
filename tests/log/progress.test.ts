import { info } from '../../src/log/info.ts';
import { Terminal } from './terminal.ts';
import { expect } from '@std/expect';
import { ProgressImpl } from '../../src/log/progress.ts';
import { context } from '../../src/log/helpers/context.ts';
import { captureOutput } from './helpers.ts';

Deno.test('progress renders and clears exclusively on stderr', () => {
    using captured = captureOutput();
    using progress = new ProgressImpl();
    expect(context.currentLiveUiItem).toBe(progress);
    progress.setMessage('Downloading');
    expect(captured.stderr).toEqual([
        '\r\x1b[0JDownloading\r\n[          ]   0.00%\x1b[1F',
    ]);
    progress.setProgress(50);
    expect(captured.stderr.at(-1)).toBe(
        '\r\x1b[0JDownloading\r\n[=====     ]  50.00%\x1b[1F',
    );
    progress.setProgress(-1);
    expect(captured.stderr.at(-1)).toContain('[          ]   0.00%');
    progress.setProgress(101);
    expect(captured.stderr.at(-1)).toContain('[==========] 100.00%');
    progress.setMessage('123456789012345678901');
    expect(captured.stderr.at(-1)).toBe(
        '\r\x1b[0J12345678901234567890\r\n1\r\n[==========] 100.00%\x1b[2F',
    );
    progress.setMessage('');
    expect(captured.stderr.at(-1)).toBe('\r\x1b[0J[==========] 100.00%\r');
    progress[Symbol.dispose]();
    expect(context.currentLiveUiItem).toBeNull();
    expect(captured.stderr.at(-1)).toBe('\r\x1b[0J');
    const count = captured.stderr.length;
    progress[Symbol.dispose]();
    progress.redraw();
    expect(captured.stderr).toHaveLength(count);
    expect(captured.stdout).toEqual([]);
});

Deno.test('non-interactive progress does not render or register', () => {
    using captured = captureOutput();
    context.nonInteractive = true;
    using progress = new ProgressImpl();
    progress.setMessage('Hidden');
    progress.setProgress(50);
    progress.redraw();
    expect(context.currentLiveUiItem).toBeNull();
    expect(captured.stderr).toEqual([]);
    expect(captured.stdout).toEqual([]);
});

Deno.test('progress redraws stay anchored, clear shorter frames and preserve interleaved logs', () => {
    using captured = captureOutput();
    for (const initial of ['', 'one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n']) {
        const terminal = new Terminal(20, 6);
        terminal.write(initial);
        captured.stderr.length = 0;
        using progress = new ProgressImpl();
        progress.setMessage('123456789012345678901');
        terminal.write(captured.stderr.splice(0).join(''));
        const startRow = initial === '' ? 0 : 3;
        expect(terminal.row).toBe(startRow);
        expect(terminal.column).toBe(0);
        expect(terminal.screen.slice(startRow, startRow + 3)).toEqual([
            '12345678901234567890',
            '1',
            '[          ]   0.00%',
        ]);
        expect(terminal.screen.slice(0, startRow)).toEqual(
            initial === '' ? [] : ['three', 'four', 'five'],
        );
        for (const value of [25, 50, 100]) {
            progress.setProgress(value);
            terminal.write(captured.stderr.splice(0).join(''));
            expect(terminal.row).toBe(startRow);
            expect(terminal.column).toBe(0);
        }
        progress.setMessage('');
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe('[==========] 100.00%');
        expect(terminal.screen.slice(startRow + 1).every((line) => line === '')).toBe(true);
        info('Saved');
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe('Saved');
        expect(terminal.screen[startRow + 1]).toBe('[==========] 100.00%');
        expect(terminal.row).toBe(startRow + 1);
        expect(terminal.column).toBe(0);
        progress[Symbol.dispose]();
        terminal.write(captured.stderr.splice(0).join(''));
        expect(terminal.screen[startRow]).toBe('Saved');
        expect(terminal.screen.slice(startRow + 1).every((line) => line === '')).toBe(true);
        expect(terminal.row).toBe(startRow + 1);
        expect(terminal.column).toBe(0);
    }
});
