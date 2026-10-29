import { expect } from '@std/expect';
import { writeSync } from '../../../src/log/helpers/write-sync.ts';

Deno.test('writeSync completes partial UTF-8 writes without duplicating bytes', () => {
    const written: number[] = [];
    const chunks: number[] = [];
    writeSync({
        writeSync(buffer): number {
            const count = Math.min(2, buffer.length);
            chunks.push(count);
            written.push(...buffer.subarray(0, count));
            return count;
        },
    }, 'héllo');
    expect(new TextDecoder().decode(new Uint8Array(written))).toBe('héllo');
    expect(chunks).toEqual([2, 2, 2]);
});

Deno.test('writeSync skips empty messages and rejects writes without progress', () => {
    let calls = 0;
    const stream = {
        writeSync(): number {
            calls++;
            return 0;
        },
    };
    writeSync(stream, '');
    expect(calls).toBe(0);
    expect(() => writeSync(stream, 'hello')).toThrow('Unable to write log output');
    expect(calls).toBe(1);
});
