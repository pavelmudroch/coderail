import { dirname, join } from '@std/path';

import { projectIgnoreLines } from '../../runtime/context.ts';
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
                report.skipped.push('Project checks: no initialized project found.');
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
        report.skipped.push('Project checks and configuration: project discovery failed.');
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
    return report;
}

export const Project = { discover, check };
