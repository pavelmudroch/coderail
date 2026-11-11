import { Cli } from '@cli';
import { Commands } from '@commands';
import { Log } from '@log';
import { expect } from '@std/expect';

import { Doctor } from '../../src/commands/doctor.ts';
import { Installation } from '../../src/commands/doctor/installation.ts';

Deno.test('doctor parses help and repair and rejects unexpected arguments', async () => {
    const doctor = new Doctor();
    expect(doctor.requiresInit).toBe(false);
    expect(doctor.getSubcommand()).toBeUndefined();
    expect(doctor.shouldHandleHelp(doctor.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        expect(doctor.shouldHandleHelp(doctor.parseArguments([help, 'ignored']))).toBe(true);
    }
    expect(doctor.getUsage()).toContain('--repair');
    for (const arg of ['--unknown', 'unexpected', '--help=yes', '--repair=yes', '--']) {
        expect(() => doctor.parseArguments([arg])).toThrow();
        try {
            doctor.parseArguments([arg]);
        } catch (error) {
            expect(Cli.isUsageError(error)).toBe(true);
        }
    }
    await expect(
        doctor.run({
            parsedArguments: doctor.parseArguments(['--repair']),
            globalArguments: Commands.cr().parseArguments([]).args,
            signal: new AbortController().signal,
        }),
    ).rejects.toThrow(/^not implemented$/);
});

Deno.test(
    'doctor collects before rendering, marks repairable findings, skips, and sets status',
    async () => {
        const original = { check: Installation.check, output: Log.output, exit: Deno.exitCode };
        const output: string[] = [];
        const doctor = new Doctor();
        const signal = new AbortController().signal;
        try {
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            for (const failures of [
                [],
                [{ message: 'broken', repairable: true, manualRepair: ['Fix it manually'] }],
                [{ message: 'broken', repairable: false, manualRepair: ['Fix it manually'] }],
            ]) {
                output.length = 0;
                Installation.check = (received) => {
                    expect(received).toBe(signal);
                    expect(output).toEqual([]);
                    return Promise.resolve({ failures, skipped: ['blocked'] });
                };
                await doctor.run({
                    parsedArguments: doctor.parseArguments([]),
                    globalArguments: Commands.cr().parseArguments([]).args,
                    signal,
                });
                expect(Deno.exitCode).toBe(failures.length ? 1 : 0);
                expect(output.join('\n')).toContain('Skipped: blocked');
                if (failures.length) {
                    expect(output.join('\n').includes('[repairable]')).toBe(
                        failures[0]?.repairable,
                    );
                    expect(output.join('\n')).toContain('Fix it manually');
                }
            }
            const controller = new AbortController();
            controller.abort(new Error('cancelled'));
            await expect(
                doctor.run({
                    parsedArguments: doctor.parseArguments([]),
                    globalArguments: Commands.cr().parseArguments([]).args,
                    signal: controller.signal,
                }),
            ).rejects.toThrow('cancelled');
        } finally {
            Installation.check = original.check;
            Log.output = original.output;
            Deno.exitCode = original.exit;
        }
    },
);

Deno.test('doctor cancellation during collection renders no findings', async () => {
    const original = { check: Installation.check, output: Log.output };
    const controller = new AbortController();
    const output: unknown[] = [];
    try {
        Installation.check = () => {
            controller.abort(new Error('cancelled during collection'));
            return Promise.resolve({
                failures: [{ message: 'partial', repairable: false, manualRepair: [] }],
                skipped: [],
            });
        };
        Log.output = (...messages) => {
            output.push(...messages);
        };
        await expect(
            new Doctor().run({
                parsedArguments: new Doctor().parseArguments([]),
                globalArguments: Commands.cr().parseArguments([]).args,
                signal: controller.signal,
            }),
        ).rejects.toThrow('cancelled during collection');
        expect(output).toEqual([]);
    } finally {
        Installation.check = original.check;
        Log.output = original.output;
    }
});
