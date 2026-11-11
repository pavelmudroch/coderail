import { expect } from '@std/expect';

import type { DoctorFailure, DoctorReport } from '../../../src/commands/doctor/types.ts';

Deno.test('doctor reports carry failures and skipped checks', () => {
    const failure: DoctorFailure = {
        message: 'failure',
        repairable: false,
        manualRepair: ['restore'],
    };
    const report: DoctorReport = { failures: [failure], skipped: ['blocked'] };
    expect(report.failures[0]).toBe(failure);
    expect(report.skipped).toEqual(['blocked']);
});

Deno.test('diagnostic phases receive independent empty reports', async () => {
    const { createDoctorReport } = await import('../../../src/commands/doctor/types.ts');
    const report = createDoctorReport();
    expect(report).toEqual({ failures: [], skipped: [] });
    report.skipped.push('blocked');
    report.failures.push({ message: 'broken', repairable: false, manualRepair: [] });
    expect(createDoctorReport()).toEqual({ failures: [], skipped: [] });
});
