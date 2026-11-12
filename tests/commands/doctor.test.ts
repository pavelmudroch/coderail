import { Cli } from '@cli';
import { Commands } from '@commands';
import { Log } from '@log';
import { expect } from '@std/expect';

import { Doctor } from '../../src/commands/doctor.ts';
import { Installation } from '../../src/commands/doctor/installation.ts';
import { captureOutput } from '../log/helpers.ts';

Deno.test('doctor parses help and repair and rejects unexpected arguments', () => {
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
    expect(doctor.parseArguments(['--repair']).args.repair).toBe(true);
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
                [
                    {
                        message: 'broken',
                        repairable: true,
                        repair: { key: 'broken', description: 'Fix broken', apply: async () => {} },
                        manualRepair: ['Fix it manually'],
                    },
                ],
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
            executable: Project.checkExecutable,
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
        using captured = captureOutput();
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
                expect(captured.stderr.join('')).toContain('installation');
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
                expect(captured.stderr.join('')).toContain('/chosen');
                expect(captured.stderr.join('')).toContain('Discovering project');
                phases.push('discovery');
                return Promise.resolve({ repositoryRoot: '/chosen', failures: [], skipped: [] });
            };
            Project.check = () => {
                expect(captured.stderr.join('')).toContain('Checking project');
                phases.push('project');
                return Promise.resolve({
                    failures: [
                        { message: 'missing config', repairable: false, manualRepair: ['cr init'] },
                    ],
                    skipped: ['dependent'],
                });
            };
            Conf.diagnoseConfiguration = (context, global, received) => {
                expect(captured.stderr.join('')).toContain('Diagnosing configuration');
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
            Project.checkExecutable = (name, received) => {
                expect(captured.stderr.join('')).toContain('harness executable');
                expect(name).toBeUndefined();
                expect(received).toBe(signal);
                expect(output).toEqual([]);
                return Promise.resolve({
                    failures: [
                        {
                            message: 'broken harness',
                            repairable: false,
                            manualRepair: ['install configured harness'],
                        },
                    ],
                    skipped: [],
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
                'Failure: broken harness',
            ]);
            expect(output).toContain('Skipped: dependent');
            expect(output).toContain('  Manual repair: install configured harness');
            Project.checkExecutable = original.executable;
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
            Project.checkExecutable = original.executable;
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
            // Real FIFO fixtures must never be opened; independent findings still render.
            Installation.check = () =>
                Promise.resolve({
                    failures: [
                        { message: 'broken installation', repairable: false, manualRepair: [] },
                    ],
                    skipped: [],
                });
            for (const name of ['config', '.gitignore']) {
                const path = join(project, '.coderail', name);
                const contents = await Deno.readTextFile(path);
                await Deno.remove(path);
                const fifo = await new Deno.Command('mkfifo', { args: [path] }).output();
                expect(fifo.success).toBe(true);
                const open = Deno.open;
                const read = Deno.readTextFile;
                try {
                    Deno.open = (input, options) => {
                        if (input === path) {
                            throw new Error('must not open FIFO');
                        }
                        return open(input, options);
                    };
                    Deno.readTextFile = (input, options) => {
                        if (input === path) {
                            throw new Error('must not read FIFO');
                        }
                        return read(input, options);
                    };
                    output.length = 0;
                    await doctor.run({
                        parsedArguments: doctor.parseArguments([]),
                        globalArguments: Commands.cr().parseArguments(['--cwd', child]).args,
                        signal: new AbortController().signal,
                    });
                    expect(Deno.exitCode).toBe(1);
                    expect(output.join('\n')).toContain('broken installation');
                    expect(output.join('\n')).toContain('expected a regular file');
                    expect(output.join('\n')).not.toContain('must not');
                } finally {
                    Deno.open = open;
                    Deno.readTextFile = read;
                    await Deno.remove(path);
                    await Deno.writeTextFile(path, contents);
                }
            }
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

Deno.test(
    'doctor source and compiled fixtures diagnose global and local instructions read only',
    async () => {
        const { Harness } = await import('@harness');
        const { InstallManifest } = await import('@install-manifest');
        const { Path } = await import('@path');
        const { join, toFileUrl } = await import('@std/path');
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const { projectIgnoreLines } = await import('../../src/runtime/context.ts');
        const { DISTRIBUTION_MANIFEST } = await import('../../src/installation/assets.ts');
        const root = await Deno.realPath(await Deno.makeTempDir());
        const project = join(root, 'project');
        const outside = join(root, 'outside');
        const entry = join(root, 'libexec', 'cr-fixture');
        const envNames = [
            'CODEX_HOME',
            'CLAUDE_CONFIG_DIR',
            'PATH',
            'DEFAULT_HARNESS',
            'LOG_LEVEL',
            'NO_COLOR',
            'NON_INTERACTIVE',
        ];
        const env = envNames.map((name) => Deno.env.get(name));
        const original = {
            build: Deno.build,
            exec: Deno.execPath,
            main: Object.getOwnPropertyDescriptor(Deno, 'mainModule'),
            output: Log.output,
            exit: Deno.exitCode,
            level: Log.level,
            noColor: Log.noColor,
            nonInteractive: Log.nonInteractive,
            write: Deno.writeTextFile,
            remove: Deno.remove,
            discover: Project.discover,
        };
        const output: string[] = [];
        const signal = new AbortController().signal;
        const doctor = new Doctor();
        try {
            envNames.forEach((name) => Deno.env.delete(name));
            Deno.env.set('CODEX_HOME', join(root, 'codex'));
            Deno.env.set('CLAUDE_CONFIG_DIR', join(root, 'claude'));
            Deno.env.set('PATH', join(root, 'bin'));
            for (const directory of ['libexec', 'bin', 'outside', 'project/.coderail']) {
                await Deno.mkdir(join(root, directory), { recursive: true });
            }
            await Deno.writeTextFile(entry, 'fixture', { mode: 0o755 });
            await Deno.writeTextFile(join(root, 'bin', 'codex'), 'must never execute', {
                mode: 0o755,
            });
            await Deno.symlink(entry, join(root, 'bin', 'cr'));
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), {
                version: 1,
                files: [],
            });
            await Deno.writeTextFile(
                join(project, '.coderail', 'config'),
                'default_harness = "codex"',
            );
            await Deno.writeTextFile(
                join(project, '.coderail', '.gitignore'),
                projectIgnoreLines.join('\n'),
            );
            const manifests: string[] = [];
            for (const target of [
                { scope: 'global' as const },
                { scope: 'local' as const, projectRoot: project },
            ]) {
                for (const name of Harness.names) {
                    using connector = Harness.get(name, target);
                    if (!connector) {
                        throw new Error('fixture connector unavailable');
                    }
                    await Deno.mkdir(connector.home, { recursive: true });
                    await Deno.writeTextFile(join(connector.home, 'owned'), 'original');
                    const path = join(connector.home, Path.INSTALL_MANIFEST_NAME);
                    await InstallManifest.save(
                        path,
                        await InstallManifest.capture(connector.home, ['owned']),
                    );
                    manifests.push(path);
                }
            }
            Object.defineProperty(Deno, 'mainModule', {
                configurable: true,
                value: toFileUrl(entry).href,
            });
            Deno.execPath = () => entry;
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            const run = async (cwd: string): Promise<void> => {
                output.length = 0;
                const write = Deno.writeTextFile;
                const remove = Deno.remove;
                Deno.writeTextFile = () => {
                    throw new Error('doctor must not write');
                };
                Deno.remove = () => {
                    throw new Error('doctor must not remove');
                };
                try {
                    await doctor.run({
                        parsedArguments: doctor.parseArguments([]),
                        globalArguments: Commands.cr().parseArguments(['--cwd', cwd]).args,
                        signal,
                    });
                } finally {
                    Deno.writeTextFile = write;
                    Deno.remove = remove;
                }
            };
            for (const standalone of [false, true]) {
                Object.defineProperty(Deno, 'build', {
                    configurable: true,
                    value: { ...original.build, standalone },
                });
                await run(project);
                expect(Deno.exitCode).toBe(0);
                expect(output).toContain('Doctor checks passed.');
                await run(outside);
                expect(Deno.exitCode).toBe(0);
                expect(output.join('\n')).toContain(
                    'local harness instructions: no initialized project',
                );
            }
            for (const name of ['unknown', 'claude']) {
                await Deno.writeTextFile(
                    join(project, '.coderail', 'config'),
                    `default_harness = "${name}"`,
                );
                await run(project);
                expect(Deno.exitCode).toBe(1);
                expect(output.filter((line) => line.startsWith('Failure:'))).toHaveLength(1);
                expect(output.join('\n')).toContain('Harness executable:');
            }
            await Deno.writeTextFile(
                join(project, '.coderail', 'config'),
                'default_harness = "codex"',
            );
            for (const path of manifests) {
                await Deno.writeTextFile(path, '{');
            }
            await Deno.writeTextFile(join(root, 'config'), 'unknown = true');
            await Deno.writeTextFile(join(project, '.coderail', '.gitignore'), 'broken');
            await run(project);
            expect(Deno.exitCode).toBe(1);
            expect(output.filter((line) => line.startsWith('Failure:'))).toHaveLength(6);
            expect(
                output.filter((line) => line.includes('Manual repair:')).length,
            ).toBeGreaterThanOrEqual(6);
            expect(output.join('\n')).toContain('[repairable]');
            expect(output.join('\n')).toContain('Harness executable: no harness configured');
            await run(outside);
            expect(Deno.exitCode).toBe(1);
            expect(output.filter((line) => line.startsWith('Failure:'))).toHaveLength(3);
            expect(output.join('\n')).toContain(
                'local harness instructions: no initialized project',
            );
            // Unavailable discovery skips local checks while retaining both global findings.
            Project.discover = () =>
                Promise.resolve({
                    failures: [],
                    skipped: ['local harness instructions: discovery unavailable'],
                });
            await run(project);
            expect(output.filter((line) => line.startsWith('Failure:'))).toHaveLength(3);
            expect(output.join('\n')).toContain('discovery unavailable');
            expect(await Deno.readTextFile(join(root, 'codex', Path.INSTALL_MANIFEST_NAME))).toBe(
                '{',
            );
        } finally {
            Project.discover = original.discover;
            Object.defineProperty(Deno, 'build', { configurable: true, value: original.build });
            if (original.main) {
                Object.defineProperty(Deno, 'mainModule', original.main);
            }
            Deno.execPath = original.exec;
            Log.output = original.output;
            Log.level = original.level;
            Log.noColor = original.noColor;
            Log.nonInteractive = original.nonInteractive;
            Deno.exitCode = original.exit;
            Deno.writeTextFile = original.write;
            Deno.remove = original.remove;
            envNames.forEach((name, index) => {
                const value = env[index];
                if (value === undefined) {
                    Deno.env.delete(name);
                } else {
                    Deno.env.set(name, value);
                }
            });
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'doctor progress precedes I/O, respects effective levels and defers final output',
    async () => {
        const { join, toFileUrl } = await import('@std/path');
        const { InstallManifest } = await import('@install-manifest');
        const { Harness } = await import('@harness');
        const { Path } = await import('@path');
        const { projectIgnoreLines } = await import('../../src/runtime/context.ts');
        using captured = captureOutput();
        const root = await Deno.realPath(await Deno.makeTempDir());
        const project = join(root, 'project');
        const entry = join(root, 'libexec', 'cr-fixture');
        const envNames = [
            'CODEX_HOME',
            'CLAUDE_CONFIG_DIR',
            'PATH',
            'LOG_LEVEL',
            'DEFAULT_HARNESS',
        ];
        const env = envNames.map((name) => Deno.env.get(name));
        const original = {
            main: Object.getOwnPropertyDescriptor(Deno, 'mainModule'),
            build: Deno.build,
            exec: Deno.execPath,
            stat: Deno.stat,
            lstat: Deno.lstat,
            realPath: Deno.realPath,
            readDir: Deno.readDir,
            readFile: Deno.readFile,
            inspect: InstallManifest.inspect,
            exit: Deno.exitCode,
        };
        try {
            envNames.forEach((name) => Deno.env.delete(name));
            Deno.env.set('CODEX_HOME', join(root, 'codex'));
            Deno.env.set('CLAUDE_CONFIG_DIR', join(root, 'claude'));
            Deno.env.set('PATH', join(root, 'bin'));
            for (const directory of [
                'libexec',
                'bin',
                'instructions',
                'assets/templates',
                'project/.coderail',
                '.coderail',
            ]) {
                await Deno.mkdir(join(root, directory), { recursive: true });
            }
            await Deno.writeTextFile(entry, 'fixture', { mode: 0o755 });
            await Deno.symlink(entry, join(root, 'bin', 'cr'));
            await Deno.writeTextFile(join(root, 'instructions', 'owned'), 'instruction');
            await Deno.writeTextFile(join(root, 'assets', 'templates', 'sample'), 'template');
            const { DISTRIBUTION_MANIFEST } = await import('../../src/installation/assets.ts');
            await InstallManifest.save(
                join(root, DISTRIBUTION_MANIFEST),
                await InstallManifest.capture(root, ['instructions/owned']),
            );
            await Deno.writeTextFile(join(root, 'config'), '');
            await Deno.writeTextFile(join(root, '.coderail', 'config'), '');
            const config = join(project, '.coderail', 'config');
            await Deno.writeTextFile(
                join(project, '.coderail', '.gitignore'),
                projectIgnoreLines.join('\n'),
            );
            for (const target of [
                { scope: 'global' as const },
                { scope: 'local' as const, projectRoot: project },
            ]) {
                for (const name of Harness.names) {
                    using connector = Harness.get(name, target);
                    if (!connector) {
                        throw new Error('missing fixture connector');
                    }
                    await Deno.mkdir(connector.home, { recursive: true });
                    await Deno.writeTextFile(join(connector.home, 'owned'), 'instruction');
                    await InstallManifest.save(
                        join(connector.home, Path.INSTALL_MANIFEST_NAME),
                        await InstallManifest.capture(connector.home, ['owned']),
                    );
                }
            }
            Object.defineProperty(Deno, 'mainModule', {
                configurable: true,
                value: toFileUrl(entry).href,
            });
            Deno.execPath = () => entry;
            const doctor = new Doctor();
            for (const standalone of [false, true]) {
                Object.defineProperty(Deno, 'build', {
                    configurable: true,
                    value: { ...original.build, standalone },
                });
                for (const scenario of [
                    {
                        flags: ['--verbose'],
                        level: 'quiet',
                        invalid: false,
                        early: true,
                        late: true,
                    },
                    {
                        flags: ['--verbose'],
                        level: 'quiet',
                        invalid: true,
                        early: true,
                        late: true,
                    },
                    { flags: [], level: 'verbose', invalid: false, early: false, late: true },
                    { flags: [], level: 'normal', invalid: false, early: false, late: false },
                    { flags: [], level: 'quiet', invalid: false, early: false, late: false },
                    { flags: [], level: 'verbose', invalid: true, early: false, late: false },
                    {
                        flags: ['--quiet'],
                        level: 'verbose',
                        invalid: false,
                        early: false,
                        late: false,
                    },
                ]) {
                    await Deno.writeTextFile(
                        config,
                        scenario.invalid
                            ? 'unknown = true'
                            : `log_level = "${scenario.level}"\ndefault_harness = "codex"`,
                    );
                    captured.stderr.length = 0;
                    captured.stdout.length = 0;
                    // Start with a conflicting level to exercise direct bootstrap callers.
                    Log.level = scenario.early ? 'quiet' : 'verbose';
                    const operations: { path: string; notices: string; output: string }[] = [];
                    const observe = (path: string | URL): void => {
                        operations.push({
                            path: String(path),
                            notices: captured.stderr.join(''),
                            output: captured.stdout.join(''),
                        });
                    };
                    Deno.stat = (path) => {
                        observe(path);
                        return original.stat(path);
                    };
                    Deno.lstat = (path) => {
                        observe(path);
                        return original.lstat(path);
                    };
                    Deno.realPath = (path) => {
                        observe(path);
                        return original.realPath(path);
                    };
                    Deno.readDir = (path) => {
                        observe(path);
                        return original.readDir(path);
                    };
                    Deno.readFile = (path, options) => {
                        observe(path);
                        return original.readFile(path, options);
                    };
                    InstallManifest.inspect = (home, manifest) => {
                        for (const file of manifest.files) {
                            observe(join(home, file.path));
                        }
                        return original.inspect(home, manifest);
                    };
                    try {
                        await doctor.run({
                            parsedArguments: doctor.parseArguments([]),
                            globalArguments: Commands.cr().parseArguments([
                                '--cwd',
                                project,
                                '--no-color',
                                ...scenario.flags,
                            ]).args,
                            signal: new AbortController().signal,
                        });
                    } finally {
                        Deno.stat = original.stat;
                        Deno.lstat = original.lstat;
                        Deno.realPath = original.realPath;
                        Deno.readDir = original.readDir;
                        Deno.readFile = original.readFile;
                        InstallManifest.inspect = original.inspect;
                    }
                    expect(operations.every((operation) => operation.output === '')).toBe(true);
                    const earlyPaths = [
                        entry,
                        project,
                        config,
                        join(root, 'config'),
                        join(project, '.coderail', '.gitignore'),
                        join(project, '.coderail', 'tickets', 'open'),
                        join(root, 'codex', Path.INSTALL_MANIFEST_NAME),
                        join(project, 'owned'),
                    ];
                    earlyPaths.push(
                        standalone
                            ? join(root, DISTRIBUTION_MANIFEST)
                            : join(root, '.coderail', 'config'),
                    );
                    earlyPaths.push(
                        standalone
                            ? join(root, 'instructions', 'owned')
                            : join(root, 'assets', 'templates', 'sample'),
                    );
                    for (const path of earlyPaths) {
                        const operation = operations.find((operation) => operation.path === path);
                        expect(operation, path).toBeDefined();
                        expect(operation?.notices.includes(path), path).toBe(scenario.early);
                    }
                    const notices = captured.stderr.join('');
                    if (scenario.early) {
                        for (const context of [
                            'installation',
                            'configuration',
                            'project',
                            'global codex',
                            'local claude',
                            'Environment',
                        ]) {
                            expect(notices.toLowerCase()).toContain(context.toLowerCase());
                        }
                        if (standalone) {
                            expect(notices).toContain(join(root, 'bin'));
                        }
                    }
                    const candidate = join(
                        root,
                        'bin',
                        Deno.build.os === 'windows' ? 'codex.COM' : 'codex',
                    );
                    if (!scenario.invalid) {
                        expect(
                            operations
                                .find((operation) => operation.path === candidate)
                                ?.notices.includes(candidate),
                        ).toBe(scenario.late);
                        expect(Deno.exitCode).toBe(1);
                        expect(captured.stdout.join('')).toContain('Harness executable:');
                    } else {
                        expect(Deno.exitCode).toBe(1);
                        expect(captured.stdout.join('')).toContain('Invalid configuration');
                        expect(notices.includes('executable')).toBe(scenario.late);
                    }
                    expect(captured.stdout.join('')).toContain('Manual repair:');
                    expect(captured.stdout.join('')).not.toContain('notice:');
                    expect(notices).not.toContain('Failure:');
                    expect(notices).not.toContain('Manual repair:');
                    if (!scenario.early && !scenario.late) {
                        expect(notices).toBe('');
                    }
                }
            }
        } finally {
            Object.defineProperty(Deno, 'build', { configurable: true, value: original.build });
            if (original.main) {
                Object.defineProperty(Deno, 'mainModule', original.main);
            }
            Deno.execPath = original.exec;
            Deno.exitCode = original.exit;
            envNames.forEach((name, index) => {
                const value = env[index];
                if (value === undefined) {
                    Deno.env.delete(name);
                } else {
                    Deno.env.set(name, value);
                }
            });
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'doctor deduplicates repairs, rechecks once in phase order and reports attempted errors',
    async () => {
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const { Conf } = await import('@conf');
        const original = {
            check: Installation.check,
            discover: Project.discover,
            project: Project.check,
            executable: Project.checkExecutable,
            diagnose: Conf.diagnoseConfiguration,
            output: Log.output,
            exit: Deno.exitCode,
        };
        const signal = new AbortController().signal;
        const doctor = new Doctor();
        const output: string[] = [];
        const events: string[] = [];
        let applied = 0;
        let failAction = false;
        const repair = {
            key: 'shared',
            description: 'Repair /shared',
            apply: async () => {
                await Promise.resolve();
                applied++;
                events.push('repair');
                if (failAction) {
                    throw new Error('/shared action failed');
                }
            },
        };
        try {
            for (const scenario of [
                { remains: false, fail: false },
                { remains: true, fail: false },
                { remains: false, fail: true },
                { remains: true, fail: true },
            ]) {
                const remains = scenario.remains;
                failAction = scenario.fail;
                output.length = 0;
                events.length = 0;
                applied = 0;
                let pass = 0;
                Installation.check = async () => {
                    await Promise.resolve();
                    events.push('installation');
                    pass++;
                    return { failures: [], skipped: [] };
                };
                Project.discover = async () => {
                    await Promise.resolve();
                    events.push('discover');
                    return { repositoryRoot: '/project', failures: [], skipped: [] };
                };
                Project.check = async () => {
                    await Promise.resolve();
                    events.push('project');
                    return {
                        failures:
                            pass === 1
                                ? [1, 2].map(() => ({
                                      message: 'broken',
                                      repairable: true,
                                      repair,
                                      manualRepair: [],
                                  }))
                                : remains
                                  ? [
                                        {
                                            message: 'new finding',
                                            repairable: true,
                                            repair: {
                                                ...repair,
                                                key: failAction ? 'new' : 'shared',
                                            },
                                            manualRepair: [],
                                        },
                                    ]
                                  : [],
                        skipped: [],
                    };
                };
                Conf.diagnoseConfiguration = () =>
                    Promise.resolve({
                        configuration: Conf.createConfiguration(
                            Commands.cr().parseArguments([]).args,
                        ),
                        errors: [],
                    });
                Project.checkExecutable = () => Promise.resolve({ failures: [], skipped: [] });
                Log.output = (...messages) => {
                    output.push(messages.join(' '));
                };
                await doctor.run({
                    parsedArguments: doctor.parseArguments(['--repair']),
                    globalArguments: Commands.cr().parseArguments(['--non-interactive']).args,
                    signal,
                });
                expect(applied).toBe(1);
                expect(events).toEqual([
                    'installation',
                    'discover',
                    'project',
                    'repair',
                    'installation',
                    'discover',
                    'project',
                ]);
                expect(output.join('\n')).toContain('Repair /shared');
                expect(output.join('\n').includes('Repair error: /shared action failed')).toBe(
                    failAction,
                );
                expect(output.join('\n')).toContain(
                    remains || failAction ? 'Unresolved:' : 'Repaired:',
                );
                expect(Deno.exitCode).toBe(remains ? 1 : 0);
            }
        } finally {
            Installation.check = original.check;
            Project.discover = original.discover;
            Project.check = original.project;
            Project.checkExecutable = original.executable;
            Conf.diagnoseConfiguration = original.diagnose;
            Log.output = original.output;
            Deno.exitCode = original.exit;
        }
    },
);

Deno.test(
    'doctor repairs discovered projects from nested cwd while preserving invalid config and healthy files',
    async () => {
        const { join } = await import('@std/path');
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const root = await Deno.makeTempDir();
        const original = {
            check: Installation.check,
            executable: Project.checkExecutable,
            output: Log.output,
            exit: Deno.exitCode,
            level: Log.level,
            color: Log.noColor,
            interactive: Log.nonInteractive,
        };
        const doctor = new Doctor();
        const signal = new AbortController().signal;
        const output: string[] = [];
        const marker = join(root, '.coderail');
        const child = join(root, 'child');
        try {
            Installation.check = () => Promise.resolve({ failures: [], skipped: [] });
            Project.checkExecutable = () => Promise.resolve({ failures: [], skipped: [] });
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            await Deno.mkdir(child);
            const run = async (): Promise<void> => {
                output.length = 0;
                await doctor.run({
                    parsedArguments: doctor.parseArguments(['--repair']),
                    globalArguments: Commands.cr().parseArguments([
                        '--cwd',
                        child,
                        '--non-interactive',
                    ]).args,
                    signal,
                });
            };
            await run();
            await expect(Deno.stat(marker)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await Deno.mkdir(marker);
            await run();
            expect(await Deno.readTextFile(join(marker, 'config'))).toContain(
                '# Coderail configuration file',
            );
            expect(output.join('\n')).toContain('Repaired:');
            const configInfo = await Deno.stat(join(marker, 'config'));
            const ignoreInfo = await Deno.stat(join(marker, '.gitignore'));
            await run();
            expect(await Deno.stat(join(marker, 'config'))).toEqual(configInfo);
            expect(await Deno.stat(join(marker, '.gitignore'))).toEqual(ignoreInfo);
            expect(output.join('\n')).not.toContain('Repaired:');
            await Deno.writeTextFile(join(marker, 'config'), 'invalid = [');
            await Deno.writeTextFile(join(marker, '.gitignore'), '# custom\n');
            await run();
            expect(await Deno.readTextFile(join(marker, 'config'))).toBe('invalid = [');
            expect(await Deno.readTextFile(join(marker, '.gitignore'))).toContain('# custom\n');
            expect(output.join('\n')).toContain('Invalid configuration');
            expect(output.join('\n')).toContain('Repaired:');
            expect(Deno.exitCode).toBe(1);
            const ticket = join(marker, 'tickets', 'closed', '9999-wrong.md');
            await Deno.mkdir(join(marker, 'tickets', 'closed'), { recursive: true });
            const ticketText =
                '---\nid: "0027"\nslug: custom\ntitle: Custom\nstatus: open\ncreated_at: now\nupdated_at: now\ndependencies: ["9998"]\n---\nKeep ticket bytes  \r\n';
            await Deno.writeTextFile(ticket, ticketText);
            for (const args of [[], ['--repair']]) {
                output.length = 0;
                await doctor.run({
                    parsedArguments: doctor.parseArguments(args),
                    globalArguments: Commands.cr().parseArguments([
                        '--cwd',
                        child,
                        '--non-interactive',
                    ]).args,
                    signal,
                });
                expect(output.join('\n')).toContain(ticket);
                expect(output.join('\n')).toContain('Blocked progression:');
                expect(output.join('\n')).toContain('Missing target "9998"');
                expect(output.join('\n')).toContain(
                    join(marker, 'tickets', 'open', '0027-custom.md'),
                );
                expect(output.join('\n')).toContain('Invalid configuration');
                expect(output.join('\n')).toContain('Manual repair:');
                const destination = join(marker, 'tickets', 'open', '0027-custom.md');
                if (args.length === 0) {
                    expect(output.join('\n')).toContain('[repairable]');
                    expect(await Deno.readTextFile(ticket)).toBe(ticketText);
                    await expect(Deno.stat(destination)).rejects.toBeInstanceOf(
                        Deno.errors.NotFound,
                    );
                } else {
                    expect(output.join('\n')).toContain('Repaired:');
                    expect(output.join('\n')).not.toContain('[repairable]');
                    expect(await Deno.readTextFile(destination)).toBe(ticketText);
                    await expect(Deno.stat(ticket)).rejects.toBeInstanceOf(Deno.errors.NotFound);
                }
                expect(Deno.exitCode).toBe(1);
            }
        } finally {
            Installation.check = original.check;
            Project.checkExecutable = original.executable;
            Log.output = original.output;
            Deno.exitCode = original.exit;
            Log.level = original.level;
            Log.noColor = original.color;
            Log.nonInteractive = original.interactive;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'doctor repairs instruction assets without prompts, rechecks partial failures and preserves manual findings',
    async () => {
        const { join } = await import('@std/path');
        const { Instructions } = await import('../../src/commands/doctor/instructions.ts');
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const { Conf } = await import('@conf');
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        const original = {
            check: Installation.check,
            discover: Project.discover,
            executable: Project.checkExecutable,
            diagnose: Conf.diagnoseConfiguration,
            output: Log.output,
            exit: Deno.exitCode,
            level: Log.level,
            noColor: Log.noColor,
            nonInteractive: Log.nonInteractive,
        };
        const output: string[] = [];
        const doctor = new Doctor();
        let fail = false;
        try {
            await Deno.mkdir(join(root, 'instructions/agents'), { recursive: true });
            const first = join(root, 'instructions/agents/first.md');
            const second = join(root, 'instructions/agents/second.md');
            const manual = join(root, 'instructions/agents/manual.md');
            const body =
                '---\nname: wrong\ndescription: Custom description\n---\nCustom body  \r\n';
            await Deno.writeTextFile(first, body);
            await Deno.writeTextFile(second, body);
            await Deno.writeTextFile(manual, '---\nname: manual\n---\nKeep this body');
            Installation.check = async (received) => {
                expect(received).toBe(signal);
                const report = await Instructions.checkAssets(root, received);
                if (fail) {
                    const repair = report.failures.find((finding) =>
                        finding.message.includes(first),
                    )?.repair;
                    if (repair) {
                        repair.apply = () => Promise.reject(new Error('instruction write denied'));
                    }
                }
                return report;
            };
            Project.discover = () => Promise.resolve({ failures: [], skipped: [] });
            Project.checkExecutable = () => Promise.resolve({ failures: [], skipped: [] });
            Conf.diagnoseConfiguration = () =>
                Promise.resolve({
                    configuration: Conf.createConfiguration(Commands.cr().parseArguments([]).args),
                    errors: [],
                });
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            const run = async (args: string[]): Promise<void> => {
                output.length = 0;
                await doctor.run({
                    parsedArguments: doctor.parseArguments(args),
                    globalArguments: Commands.cr().parseArguments(['--non-interactive']).args,
                    signal,
                });
            };
            await run([]);
            expect(await Deno.readTextFile(first)).toBe(body);
            expect(await Deno.readTextFile(second)).toBe(body);
            expect(Deno.exitCode).toBe(1);
            expect(output.join('\n')).toContain('[repairable]');
            fail = true;
            await run(['--repair']);
            expect(await Deno.readTextFile(first)).toBe(body);
            expect(await Deno.readTextFile(second)).toContain('name: "second"');
            expect(output.join('\n')).toContain('Repair error: instruction write denied');
            expect(output.join('\n')).toContain('Repaired:');
            expect(output.join('\n')).toContain('Manual repair:');
            expect(Deno.exitCode).toBe(1);
            fail = false;
            await run(['--repair']);
            expect(await Deno.readTextFile(first)).toContain('name: "first"');
            expect(await Deno.readTextFile(manual)).toBe('---\nname: manual\n---\nKeep this body');
            expect(Deno.exitCode).toBe(1);
            await Deno.writeTextFile(
                manual,
                '---\nname: manual\ndescription: custom\n---\nKeep this body',
            );
            await run(['--repair']);
            expect(Deno.exitCode).toBe(0);
            expect(output.join('\n')).toContain('Doctor checks passed.');
            expect(output.join('\n')).not.toContain('Repaired:');
        } finally {
            Installation.check = original.check;
            Project.discover = original.discover;
            Project.checkExecutable = original.executable;
            Conf.diagnoseConfiguration = original.diagnose;
            Log.output = original.output;
            Deno.exitCode = original.exit;
            Log.level = original.level;
            Log.noColor = original.noColor;
            Log.nonInteractive = original.nonInteractive;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'doctor ticket moves converge with initialization, manual defects, failures and cancellation',
    async () => {
        const { join } = await import('@std/path');
        const { Project } = await import('../../src/commands/doctor/project.ts');
        const root = await Deno.makeTempDir();
        const original = {
            check: Installation.check,
            executable: Project.checkExecutable,
            output: Log.output,
            exit: Deno.exitCode,
            level: Log.level,
            noColor: Log.noColor,
            nonInteractive: Log.nonInteractive,
            link: Deno.link,
        };
        const output: string[] = [];
        const doctor = new Doctor();
        let collections = 0;
        const body = (id: string, dependencies = '[]'): string =>
            `---\nid: "${id}"\nslug: fix-parser\ntitle: Fix parser\nstatus: closed\nreason: done\ncreated_at: original-created\nupdated_at: original-updated\ndependencies: ${dependencies}\n---\nCustom body  \r\n`;
        const source = (id: string): string =>
            join(root, '.coderail/tickets/active', `${id}-wrong.md`);
        const destination = (id: string): string =>
            join(root, '.coderail/tickets/closed', `${id}-fix-parser.md`);
        const run = async (
            repair: boolean,
            signal = new AbortController().signal,
        ): Promise<void> => {
            output.length = 0;
            collections = 0;
            await doctor.run({
                parsedArguments: doctor.parseArguments(repair ? ['--repair'] : []),
                globalArguments: Commands.cr().parseArguments(['--cwd', root, '--non-interactive'])
                    .args,
                signal,
            });
        };
        try {
            Installation.check = () => {
                collections++;
                return Promise.resolve({ failures: [], skipped: [] });
            };
            Project.checkExecutable = () => Promise.resolve({ failures: [], skipped: [] });
            Log.output = (...messages) => {
                output.push(messages.join(' '));
            };
            await Deno.mkdir(join(root, '.coderail/tickets/active'), { recursive: true });
            await Deno.writeTextFile(source('0042'), body('0042', '["9999"]'));
            await Deno.writeTextFile(source('0043'), body('0043'));
            await run(false);
            expect(collections).toBe(1);
            expect(await Deno.readTextFile(source('0042'))).toBe(body('0042', '["9999"]'));
            expect(await Deno.readTextFile(source('0043'))).toBe(body('0043'));
            await expect(Deno.stat(join(root, '.coderail/config'))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );
            Deno.link = (from, to) =>
                String(from) === source('0042')
                    ? Promise.reject(new Error('ticket move denied'))
                    : original.link(from, to);
            await run(true);
            expect(collections).toBe(2);
            expect(output.join('\n')).toContain('Repair error: ticket move denied');
            expect(output.join('\n')).toContain('Repaired:');
            expect(output.join('\n')).toContain('Missing target "9999"');
            expect(Deno.exitCode).toBe(1);
            expect(await Deno.readTextFile(destination('0043'))).toBe(body('0043'));
            await expect(Deno.stat(source('0043'))).rejects.toBeInstanceOf(Deno.errors.NotFound);
            const configInfo = await Deno.stat(join(root, '.coderail/config'));
            const healthyInfo = await Deno.stat(destination('0043'));
            await Deno.writeTextFile(source('0044'), body('0044'));
            const controller = new AbortController();
            let completedSource = '';
            Deno.link = async (from, to) => {
                await original.link(from, to);
                completedSource = String(from);
                controller.abort(new Error('cancelled after move'));
            };
            await expect(run(true, controller.signal)).rejects.toThrow('cancelled after move');
            expect(collections).toBe(1);
            await expect(Deno.stat(completedSource)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            const completedId = completedSource.includes('0042') ? '0042' : '0044';
            expect(await Deno.readTextFile(destination(completedId))).toBe(
                body(completedId, completedId === '0042' ? '["9999"]' : '[]'),
            );
            const pendingId = completedId === '0042' ? '0044' : '0042';
            expect(await Deno.readTextFile(source(pendingId))).toContain('Custom body');
            Deno.link = original.link;
            await run(true);
            expect(collections).toBe(2);
            expect(output.join('\n')).toContain('Missing target "9999"');
            expect(output.join('\n')).toContain('Manual repair:');
            expect(output.join('\n')).not.toContain('[repairable]');
            expect(Deno.exitCode).toBe(1);
            await Deno.writeTextFile(destination('9999'), body('9999'));
            await run(true);
            expect(collections).toBe(2);
            expect(Deno.exitCode).toBe(0);
            expect(output.join('\n')).not.toContain('Repaired:');
            expect(await Deno.stat(join(root, '.coderail/config'))).toEqual(configInfo);
            expect(await Deno.stat(destination('0043'))).toEqual(healthyInfo);
        } finally {
            Installation.check = original.check;
            Project.checkExecutable = original.executable;
            Log.output = original.output;
            Deno.exitCode = original.exit;
            Log.level = original.level;
            Log.noColor = original.noColor;
            Log.nonInteractive = original.nonInteractive;
            Deno.link = original.link;
            await Deno.remove(root, { recursive: true });
        }
    },
);
