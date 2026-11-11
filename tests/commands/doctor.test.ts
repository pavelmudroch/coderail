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

Deno.test(
    'doctor finishes installation before discovery and combines failures while preserving explicit flags',
    async () => {
        const { Conf } = await import('@conf');
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const original = {
            check: Installation.check,
            discover: Project.discover,
            project: Project.check,
            diagnose: Conf.diagnoseConfiguration,
            output: Log.output,
            realPath: Deno.realPath,
            level: Log.level,
            noColor: Log.noColor,
            nonInteractive: Log.nonInteractive,
            exit: Deno.exitCode,
        };
        const output: string[] = [];
        const phases: string[] = [];
        const doctor = new Doctor();
        const signal = new AbortController().signal;
        const globals = Commands.cr().parseArguments([
            '--cwd',
            '/chosen',
            '--verbose',
            '--no-color',
            '--non-interactive',
        ]).args;
        try {
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            Installation.check = () => {
                phases.push('installation');
                return Promise.resolve({
                    failures: [
                        { message: 'broken installation', repairable: false, manualRepair: [] },
                    ],
                    skipped: [],
                });
            };
            Project.discover = (cwd, received) => {
                expect(phases).toEqual(['installation']);
                expect(cwd).toBe('/chosen');
                expect(received).toBe(signal);
                expect(output).toEqual([]);
                phases.push('discovery');
                return Promise.resolve({ repositoryRoot: '/chosen', failures: [], skipped: [] });
            };
            Project.check = () => {
                phases.push('project');
                return Promise.resolve({
                    failures: [
                        { message: 'missing config', repairable: false, manualRepair: ['cr init'] },
                    ],
                    skipped: ['dependent'],
                });
            };
            Conf.diagnoseConfiguration = (context, global, received) => {
                expect(context.repositoryRoots).toEqual(['/chosen']);
                expect(global).toBe(globals);
                expect(received).toBe(signal);
                expect(phases).toEqual(['installation', 'discovery', 'project']);
                expect(output).toEqual([]);
                return Promise.resolve({
                    configuration: Conf.createConfiguration(global),
                    errors: [new Error('bad environment')],
                });
            };
            await doctor.run({
                parsedArguments: doctor.parseArguments([]),
                globalArguments: globals,
                signal,
            });
            expect(Deno.exitCode).toBe(1);
            expect(output.filter((line) => line.startsWith('Failure:'))).toEqual([
                'Failure: broken installation',
                'Failure: missing config',
                'Failure: bad environment',
            ]);
            expect(output).toContain('Skipped: dependent');
            expect(Log.level).toBe('verbose');
            expect(Log.noColor).toBe(true);
            expect(Log.nonInteractive).toBe(true);
            // A path failure must preserve installation findings and still diagnose environment.
            Deno.realPath = () => Promise.reject(new Deno.errors.PermissionDenied());
            Project.discover = () =>
                Promise.resolve({ failures: [], skipped: ['discovery unavailable'] });
            Conf.diagnoseConfiguration = (context, global) => {
                expect(context.installRoot).toBeUndefined();
                expect(context.repositoryRoots).toEqual([]);
                return Promise.resolve({
                    configuration: Conf.createConfiguration(global),
                    errors: [],
                });
            };
            await doctor.run({
                context: { currentWorkingDirectory: '/chosen', installRoot: '/unavailable' },
                configuration: Conf.createConfiguration(globals),
                parsedArguments: doctor.parseArguments([]),
                signal,
            });
            expect(output.join('\n')).toContain('installation paths unavailable');
            expect(Deno.exitCode).toBe(1);
        } finally {
            Installation.check = original.check;
            Project.discover = original.discover;
            Project.check = original.project;
            Conf.diagnoseConfiguration = original.diagnose;
            Log.output = original.output;
            Deno.realPath = original.realPath;
            Log.level = original.level;
            Log.noColor = original.noColor;
            Log.nonInteractive = original.nonInteractive;
            Deno.exitCode = original.exit;
        }
    },
);

Deno.test(
    'doctor runs healthy outside and nested projects and reports simultaneous configuration and installation failures',
    async () => {
        const { dirname, join, toFileUrl } = await import('@std/path');
        const { projectIgnoreLines } = await import('../../src/runtime/context.ts');
        const root = await Deno.makeTempDir();
        const entry = join(root, 'src', 'main.ts');
        const project = join(root, 'project');
        const child = join(project, 'child');
        const outside = join(root, 'outside');
        const original = {
            check: Installation.check,
            output: Log.output,
            build: Deno.build,
            exec: Deno.execPath,
            main: Object.getOwnPropertyDescriptor(Deno, 'mainModule'),
            exit: Deno.exitCode,
            level: Log.level,
            noColor: Log.noColor,
            nonInteractive: Log.nonInteractive,
            env: Deno.env.get('LOG_LEVEL'),
        };
        const output: string[] = [];
        const doctor = new Doctor();
        try {
            Deno.env.delete('LOG_LEVEL');
            await Deno.mkdir(dirname(entry));
            await Deno.writeTextFile(entry, '');
            await Deno.mkdir(outside);
            await Deno.mkdir(child, { recursive: true });
            await Deno.mkdir(join(project, '.coderail'));
            await Deno.writeTextFile(join(project, '.coderail', 'config'), 'log_level = "quiet"');
            await Deno.writeTextFile(
                join(project, '.coderail', '.gitignore'),
                projectIgnoreLines.join('\n'),
            );
            Object.defineProperty(Deno, 'mainModule', {
                configurable: true,
                value: toFileUrl(entry).href,
            });
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            Installation.check = () => Promise.resolve({ failures: [], skipped: [] });
            for (const cwd of [outside, child]) {
                output.length = 0;
                await doctor.run({
                    parsedArguments: doctor.parseArguments([]),
                    globalArguments: Commands.cr().parseArguments(['--cwd', cwd]).args,
                    signal: new AbortController().signal,
                });
                expect(Deno.exitCode).toBe(0);
                expect(output).toContain('Doctor checks passed.');
            }
            expect(Log.level).toBe('quiet');
            await Deno.writeTextFile(join(root, 'config'), 'unknown = true');
            await Deno.writeTextFile(join(project, '.coderail', 'config'), 'unknown = true');
            Deno.env.set('LOG_LEVEL', 'bad');
            Installation.check = () =>
                Promise.resolve({
                    failures: [
                        { message: 'broken installation', repairable: false, manualRepair: [] },
                    ],
                    skipped: [],
                });
            output.length = 0;
            await doctor.run({
                parsedArguments: doctor.parseArguments([]),
                globalArguments: Commands.cr().parseArguments(['--cwd', child]).args,
                signal: new AbortController().signal,
            });
            expect(Deno.exitCode).toBe(1);
            expect(output.filter((line) => line.startsWith('Failure:'))).toHaveLength(4);
            expect(Log.level).toBe('normal');
            expect(Deno.readTextFileSync(join(project, '.coderail', 'config'))).toBe(
                'unknown = true',
            );
            // Compiled mode resolves the executable and omits source repository configuration.
            Object.defineProperty(Deno, 'build', {
                configurable: true,
                value: { ...original.build, standalone: true },
            });
            Deno.execPath = () => entry;
            await doctor.run({
                parsedArguments: doctor.parseArguments([]),
                globalArguments: Commands.cr().parseArguments(['--cwd', outside]).args,
                signal: new AbortController().signal,
            });
        } finally {
            Installation.check = original.check;
            Log.output = original.output;
            Object.defineProperty(Deno, 'build', { configurable: true, value: original.build });
            if (original.main) {
                Object.defineProperty(Deno, 'mainModule', original.main);
            }
            Deno.execPath = original.exec;
            Deno.exitCode = original.exit;
            Log.level = original.level;
            Log.noColor = original.noColor;
            Log.nonInteractive = original.nonInteractive;
            if (original.env === undefined) {
                Deno.env.delete('LOG_LEVEL');
            } else {
                Deno.env.set('LOG_LEVEL', original.env);
            }
            await Deno.remove(root, { recursive: true });
        }
    },
);
