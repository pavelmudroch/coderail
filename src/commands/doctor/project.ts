import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { Harness } from '@harness';
import { Log } from '@log';
import { projectIgnoreLines, ProjectInitialization } from '@project';
import { dirname, join } from '@std/path';

import { Installation } from './installation.ts';
import { Tickets } from './tickets.ts';
import { createDoctorReport, type DoctorReport } from './types.ts';

/** Discovery deliberately accepts incomplete initialization as a project marker. */
async function discover(
    cwd: string,
    signal: AbortSignal,
): Promise<DoctorReport & { repositoryRoot?: string }> {
    const report = createDoctorReport();
    signal.throwIfAborted();
    Log.notice(`Inspecting project discovery cwd "${cwd}".`);
    try {
        if (!(await Deno.stat(cwd)).isDirectory) {
            throw new Error(`Working directory "${cwd}" is not a directory`);
        }
        let directory = cwd;
        while (true) {
            signal.throwIfAborted();
            try {
                Log.notice(`Inspecting project marker "${join(directory, '.coderail')}".`);
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
        Log.notice(`Checking project initialization "${path}".`);
        let original: string | undefined;
        let incomplete = false;
        try {
            if (name === 'config') {
                await Deno.stat(path);
            } else {
                const info = await Deno.stat(path);
                signal.throwIfAborted();
                if (!info.isFile) {
                    throw new Error('Unsupported ignore file type: expected a regular file');
                }
                original = await Deno.readTextFile(path, { signal });
                const lines = original.split(/\r?\n/);
                if (lines[0] !== '*' || !projectIgnoreLines.every((line) => lines.includes(line))) {
                    incomplete = true;
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
            // Never offer repairs for symlinks, unsupported types or access failures.
            let supported = false;
            if (incomplete || error instanceof Deno.errors.NotFound) {
                try {
                    const info = await Deno.lstat(path);
                    supported = incomplete && info.isFile;
                } catch (inspectionError) {
                    signal.throwIfAborted();
                    supported = inspectionError instanceof Deno.errors.NotFound;
                }
            }
            const repair = supported
                ? {
                      key: `project-initialization:${path}`,
                      description: `Repair project initialization "${path}"`,
                      async apply(actionSignal: AbortSignal): Promise<void> {
                          actionSignal.throwIfAborted();
                          let current: string | undefined;
                          try {
                              const info = await Deno.lstat(path);
                              if (!info.isFile || original === undefined) {
                                  throw new Error(`Collected input changed at "${path}"`);
                              }
                              current = await Deno.readTextFile(path, { signal: actionSignal });
                          } catch (readError) {
                              actionSignal.throwIfAborted();
                              if (!(readError instanceof Deno.errors.NotFound)) {
                                  throw readError;
                              }
                          }
                          if (current !== original) {
                              throw new Error(`Collected input changed at "${path}"`);
                          }
                          actionSignal.throwIfAborted();
                          if (name === 'config') {
                              await ProjectInitialization.ensureConfig(root, actionSignal, {
                                  original,
                              });
                          } else {
                              await ProjectInitialization.ensureIgnoreRules(root, actionSignal, {
                                  original,
                              });
                          }
                      },
                  }
                : undefined;
            report.failures.push({
                message: `Project initialization "${path}": ${String(error)}`,
                repairable: repair !== undefined,
                repair,
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
    const tickets = await Tickets.check(root, signal);
    report.failures.push(...tickets.failures);
    report.skipped.push(...tickets.skipped);
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
    Log.notice(`Resolving configured harness "${name}" executable candidates.`);
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
                    Log.notice(`Checking harness "${name}" executable candidate "${path}".`);
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
