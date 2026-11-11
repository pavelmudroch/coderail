import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { Harness } from '@harness';
import { dirname, join } from '@std/path';

import { projectIgnoreLines } from '../../runtime/context.ts';
import { Installation } from './installation.ts';
import { createDoctorReport, type DoctorReport } from './types.ts';

/** Discovery deliberately accepts incomplete initialization as a project marker. */
async function discover(
    cwd: string,
    signal: AbortSignal,
): Promise<DoctorReport & { repositoryRoot?: string }> {
    const report = createDoctorReport();
    signal.throwIfAborted();
    try {
        if (!(await Deno.stat(cwd)).isDirectory) {
            throw new Error(`Working directory "${cwd}" is not a directory`);
        }
        let directory = cwd;
        while (true) {
            signal.throwIfAborted();
            try {
                const info = await Deno.stat(join(directory, '.coderail'));
                signal.throwIfAborted();
                if (info.isDirectory) {
                    return { ...report, repositoryRoot: directory };
                }
            } catch (error) {
                signal.throwIfAborted();
                if (!(error instanceof Deno.errors.NotFound)) {
                    throw error;
                }
            }
            const parent = dirname(directory);
            if (parent === directory) {
                report.skipped.push(
                    'Project checks and local harness instructions: no initialized project found.',
                );
                return report;
            }
            directory = parent;
        }
    } catch (error) {
        signal.throwIfAborted();
        report.failures.push({
            message: `Project discovery: ${String(error)}`,
            repairable: false,
            manualRepair: [`Check directory access permissions for "${cwd}" and its ancestors.`],
        });
        report.skipped.push(
            'Project checks, configuration and local harness instructions: project discovery failed.',
        );
        return report;
    }
}

/** Check initialization independently; configuration contents are validated by Conf. */
async function check(root: string, signal: AbortSignal): Promise<DoctorReport> {
    const report = createDoctorReport();
    for (const name of ['config', '.gitignore']) {
        signal.throwIfAborted();
        const path = join(root, '.coderail', name);
        try {
            if (name === 'config') {
                await Deno.stat(path);
            } else {
                const info = await Deno.stat(path);
                signal.throwIfAborted();
                if (!info.isFile) {
                    throw new Error('Unsupported ignore file type: expected a regular file');
                }
                const lines = (await Deno.readTextFile(path, { signal })).split(/\r?\n/);
                if (lines[0] !== '*' || !projectIgnoreLines.every((line) => lines.includes(line))) {
                    throw new Error('Incomplete ignore rules');
                }
            }
            signal.throwIfAborted();
        } catch (error) {
            signal.throwIfAborted();
            // Conf reports configuration access/validation errors, avoiding duplicate findings.
            if (name === 'config' && !(error instanceof Deno.errors.NotFound)) {
                continue;
            }
            report.failures.push({
                message: `Project initialization "${path}": ${String(error)}`,
                repairable: false,
                manualRepair: [`Run "cr init" from "${root}"; check file access permissions.`],
            });
        }
    }
    const instructions = await Installation.checkInstructions(
        { scope: 'local', projectRoot: root },
        signal,
    );
    report.failures.push(...instructions.failures);
    report.skipped.push(...instructions.skipped);
    return report;
}

/** Resolve the configured command locally without spawning a harness process. */
async function checkExecutable(
    name: string | undefined,
    signal: AbortSignal,
): Promise<DoctorReport> {
    const report = createDoctorReport();
    signal.throwIfAborted();
    if (!name) {
        report.skipped.push('Harness executable: no harness configured.');
        return report;
    }
    try {
        if (!Harness.names.includes(name)) {
            throw new Error(`Unknown harness "${name}"`);
        }
        const windows = Deno.build.os === 'windows';
        const extensions = windows
            ? (Deno.env.get('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';')
            : [''];
        const errors: string[] = [];
        for (const directory of (Deno.env.get('PATH') ?? '').split(windows ? ';' : ':')) {
            for (const extension of extensions) {
                signal.throwIfAborted();
                try {
                    const path = join(directory || '.', `${name}${extension}`);
                    const info = await Deno.stat(path);
                    signal.throwIfAborted();
                    if (info.isFile) {
                        if (!windows) {
                            await access(path, constants.X_OK);
                            signal.throwIfAborted();
                        }
                        return report;
                    }
                } catch (error) {
                    signal.throwIfAborted();
                    if (!(error instanceof Deno.errors.NotFound)) {
                        errors.push(String(error));
                    }
                }
            }
        }
        throw new Error(
            `Executable "${name}" unavailable on PATH${errors.length ? `: ${errors.join('; ')}` : ''}`,
        );
    } catch (error) {
        signal.throwIfAborted();
        report.failures.push({
            message: `Harness executable: ${String(error)}`,
            repairable: false,
            manualRepair: [
                `Configure a supported defaultHarness (${Harness.names.join(', ')}) and install its executable on PATH with execute permissions.`,
            ],
        });
    }
    return report;
}

export const Project = { discover, check, checkExecutable };
