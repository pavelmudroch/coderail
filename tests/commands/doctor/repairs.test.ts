import { expect } from '@std/expect';

import { runRepairs } from '../../../src/commands/doctor/repairs.ts';
import type { DoctorRepair } from '../../../src/commands/doctor/types.ts';

Deno.test(
    'repairs collect independent errors and propagate cancellation without rollback',
    async () => {
        const controller = new AbortController();
        const applied: string[] = [];
        expect(await runRepairs([], controller.signal)).toEqual([]);
        const action = (key: string): DoctorRepair => ({
            key,
            description: `Repair ${key}`,
            apply: async (signal: AbortSignal) => {
                await Promise.resolve();
                expect(signal).toBe(controller.signal);
                applied.push(key);
                if (key === 'broken') {
                    throw new Error('/broken denied');
                }
                if (key === 'string') {
                    throw 'string error';
                }
                if (key === 'cancel') {
                    controller.abort(new Error('cancelled'));
                }
            },
        });
        expect(
            await runRepairs([action('broken'), action('string'), action('ok')], controller.signal),
        ).toEqual([
            { key: 'broken', description: 'Repair broken', error: '/broken denied' },
            { key: 'string', description: 'Repair string', error: 'string error' },
            { key: 'ok', description: 'Repair ok' },
        ]);
        await expect(
            runRepairs([action('cancel'), action('never')], controller.signal),
        ).rejects.toThrow('cancelled');
        expect(applied).toEqual(['broken', 'string', 'ok', 'cancel']);
        await expect(runRepairs([], controller.signal)).rejects.toThrow('cancelled');
    },
);
