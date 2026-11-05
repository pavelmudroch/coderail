import { expect } from '@std/expect';
import { fromFileUrl, join } from '@std/path';

import { activateDistribution } from '../../src/commands/upgrade/activation.ts';
import { targetTriple } from '../../src/commands/upgrade/distribution.ts';
import { checkPackage } from '../../tools/check-package.ts';
import { packageRelease } from '../../tools/internal/package-build.ts';
import { targets } from '../../tools/internal/package-options.ts';

async function copy(source: string, destination: string): Promise<void> {
    if ((await Deno.lstat(source)).isDirectory) {
        await Deno.mkdir(destination);
        for await (const entry of Deno.readDir(source)) {
            await copy(join(source, entry.name), join(destination, entry.name));
        }
    } else {
        await Deno.copyFile(source, destination);
    }
}

async function run(
    cwd: string,
    command: string,
    args: string[],
    env: Record<string, string> = {},
): Promise<string> {
    const result = await new Deno.Command(command, {
        cwd,
        args,
        env: {
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: Deno.build.os === 'windows' ? 'NUL' : '/dev/null',
            ...env,
        },
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    expect(result.success, new TextDecoder().decode(result.stderr)).toBe(true);
    return new TextDecoder().decode(result.stdout).replaceAll('\x1b[0K', '').trim();
}

Deno.test({
    name: 'real canary: two source SHAs survive consumer staging, first install and optional-resource upgrade',
    ignore: Deno.env.get('CODERAIL_PACKAGE_ACCEPTANCE') !== '1',
    fn: async () => {
        const temporary = await Deno.makeTempDir({ prefix: 'canary-real-' });
        try {
            const repository = fromFileUrl(new URL('../../', import.meta.url));
            const root = join(temporary, 'source');
            const installation = join(temporary, 'installation');
            const project = join(temporary, 'project');
            await Deno.mkdir(root);
            await Deno.mkdir(installation);
            await Deno.mkdir(project);
            // Force smoke installations beneath a path whose physical spelling differs.
            const smokeTemporary = join(temporary, 'smoke-temporary');
            const smokeTemporaryLink = join(temporary, 'smoke-temporary-link');
            await Deno.mkdir(smokeTemporary);
            await Deno.symlink(smokeTemporary, smokeTemporaryLink, {
                type: Deno.build.os === 'windows' ? 'junction' : 'dir',
            });
            for (const file of ['src', 'assets', 'deno.json', 'deno.lock']) {
                await copy(join(repository, file), join(root, file));
            }
            const git = (...args: string[]): Promise<string> => run(root, 'git', args);
            await git('init', '--quiet');
            await git('config', 'user.name', 'Canary Acceptance');
            await git('config', 'user.email', 'canary@example.com');
            await git('add', '.');
            await git('commit', '-qm', 'First canary source');
            const version = /CODERAIL_VERSION = '([^']+)'/.exec(
                await Deno.readTextFile(join(root, 'src/cli/version.ts')),
            )?.[1];
            const commits: string[] = [];
            const executables: string[] = [];
            for (const index of [0, 1]) {
                if (index === 1) {
                    await git('rm', '-r', 'assets');
                    await git('commit', '-qm', 'Second canary without optional resources');
                }
                const commit = await git('rev-parse', 'HEAD');
                const options = {
                    target: targetTriple(Deno.build.os, Deno.build.arch),
                    version: 'canary',
                    commit,
                    output: join(temporary, `packages-${index}`),
                };
                await packageRelease(options, root);
                if (index === 0) {
                    await run(
                        root,
                        Deno.execPath(),
                        [
                            'run',
                            '-A',
                            join(repository, 'tools/internal/smoke-package.ts'),
                            '--target',
                            options.target,
                            '--version',
                            'canary',
                            '--commit',
                            commit,
                            '--output',
                            options.output,
                        ],
                        {
                            TMPDIR: smokeTemporaryLink,
                            TMP: smokeTemporaryLink,
                            TEMP: smokeTemporaryLink,
                        },
                    );
                }
                await checkPackage(options, async (stage) => {
                    expect(stage.build).toEqual({
                        schemaVersion: 1,
                        version: 'canary',
                        commit,
                        target: options.target,
                    });
                    const result = await activateDistribution(installation, stage);
                    expect(result.selectedExecutable).toContain(`cr-canary-${commit}`);
                    expect(
                        await run(project, result.selectedExecutable, ['--no-color', '--version']),
                    ).toBe(`Coderail version ${version}`);
                    const again = await activateDistribution(installation, stage);
                    expect(again.selectedExecutable).toBe(result.selectedExecutable);
                    executables.push(result.selectedExecutable);
                });
                commits.push(commit);
                if (index === 0) {
                    expect(
                        await Deno.readTextFile(
                            join(installation, 'instructions/skills/code/SKILL.md'),
                        ),
                    ).toContain('minimum complete working solution');
                } else {
                    await expect(
                        Deno.stat(join(installation, 'instructions/skills/code/SKILL.md')),
                    ).rejects.toThrow();
                    // The same resource-free package also supports a first installation.
                    const empty = join(temporary, 'empty');
                    await Deno.mkdir(empty);
                    await checkPackage(options, async (stage) => {
                        const first = await activateDistribution(empty, stage);
                        expect(
                            await run(project, first.selectedExecutable, [
                                '--no-color',
                                '--version',
                            ]),
                        ).toBe(`Coderail version ${version}`);
                    });
                }
            }
            expect(commits[0]).not.toBe(commits[1]);
            expect(executables[0]).not.toBe(executables[1]);
        } finally {
            await Deno.remove(temporary, { recursive: true });
        }
    },
});

Deno.test({
    name: 'real packages: six compiler targets, stable/canary, native first install and upgrade',
    // Explicit acceptance job, separate from the application suite and unit checks.
    ignore: Deno.env.get('CODERAIL_PACKAGE_ACCEPTANCE') !== '1',
    fn: async () => {
        const temporary = await Deno.makeTempDir({ prefix: 'package-real-' });
        try {
            const repository = fromFileUrl(new URL('../../', import.meta.url));
            const root = join(temporary, 'source');
            await Deno.mkdir(root);
            for (const file of ['src', 'assets', 'deno.json', 'deno.lock']) {
                await copy(join(repository, file), join(root, file));
            }
            const git = (...args: string[]): Promise<string> => run(root, 'git', args);
            await git('init', '--quiet');
            await git('config', 'user.name', 'Package Acceptance');
            await git('config', 'user.email', 'package@example.com');
            await git('add', '.');
            await git('commit', '-qm', 'Source snapshot');
            const commit = await git('rev-parse', 'HEAD');
            const source = await Deno.readTextFile(join(root, 'src/cli/version.ts'));
            const version = /CODERAIL_VERSION = '([^']+)'/.exec(source)?.[1];
            if (!version) {
                throw new Error('Missing source version');
            }
            const native = targetTriple(Deno.build.os, Deno.build.arch);
            const installation = join(temporary, 'installation');
            const project = join(temporary, 'project');
            await Deno.mkdir(installation);
            await Deno.mkdir(project);
            for (const target of targets) {
                console.log(`Compiling/checking ${target} at ${commit}`);
                const options = { target, version, commit, output: join(temporary, target) };
                await packageRelease(options, root);
                await checkPackage(options, async (stage) => {
                    expect(stage.build).toEqual({ schemaVersion: 1, version, commit, target });
                    expect(
                        await Deno.readTextFile(join(stage.instructions, 'skills/code/SKILL.md')),
                    ).toBe(
                        await Deno.readTextFile(
                            join(root, 'assets/instructions/skills/code/SKILL.md'),
                        ),
                    );
                    if (target !== native) {
                        return;
                    }
                    const first = await activateDistribution(installation, stage);
                    expect(
                        await run(project, first.selectedExecutable, ['--no-color', '--version']),
                    ).toBe(`Coderail version ${version}`);
                    await run(project, first.selectedExecutable, ['init']);
                    const probeSource = join(root, 'resource-probe.ts');
                    await Deno.writeTextFile(
                        probeSource,
                        `
import { Commands } from '@commands';
import { createContext } from './src/runtime/context.ts';
import { join } from '@std/path';
const context = await createContext(Commands.cr().parseArguments([]).args, { requiresInit: false });
console.log(context.resourceRoot);
try {
    console.log(await Deno.readTextFile(join(context.resourceRoot ?? '', 'instructions/skills/code/SKILL.md')));
} catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) { throw error; }
    console.log('no instructions');
}
`,
                    );
                    const probe = join(
                        installation,
                        'libexec',
                        Deno.build.os === 'windows' ? 'resource-probe.exe' : 'resource-probe',
                    );
                    await run(root, Deno.execPath(), [
                        'compile',
                        '-A',
                        '--output',
                        probe,
                        probeSource,
                    ]);
                    const resources = await run(project, probe, []);
                    expect(resources).toContain(await Deno.realPath(installation));
                    expect(resources).toContain('minimum complete working solution');
                    const again = await activateDistribution(installation, stage);
                    expect(again.selectedExecutable).toBe(first.selectedExecutable);
                });
            }
            // Canary remains tied to the source commit while the executable reports
            // the source's stable version. Remove resources to exercise reconciliation.
            await git('rm', '-r', 'assets');
            await git('commit', '-qm', 'Optional resource sets');
            const canary = {
                target: native,
                version: 'canary',
                commit: await git('rev-parse', 'HEAD'),
                output: join(temporary, 'canary'),
            };
            await run(root, Deno.execPath(), [
                'run',
                '-A',
                join(repository, 'tools/package.ts'),
                '--target',
                canary.target,
                '--version',
                canary.version,
                '--commit',
                canary.commit,
                '--output',
                canary.output,
            ]);
            await run(root, Deno.execPath(), [
                'run',
                '-A',
                join(repository, 'tools/check-package.ts'),
                '--target',
                canary.target,
                '--version',
                canary.version,
                '--commit',
                canary.commit,
                '--output',
                canary.output,
            ]);
            await Deno.mkdir(join(installation, 'templates'), { recursive: true });
            await Deno.writeTextFile(join(installation, 'templates/personal.md'), 'personal');
            await checkPackage(canary, async (stage) => {
                const next = await activateDistribution(installation, stage);
                expect(next.selectedExecutable).toContain(`cr-canary-${canary.commit}`);
                const probe = join(
                    installation,
                    'libexec',
                    Deno.build.os === 'windows' ? 'resource-probe.exe' : 'resource-probe',
                );
                expect(await run(project, probe, [])).toContain('no instructions');
                expect(
                    await run(project, next.selectedExecutable, ['--no-color', '--version']),
                ).toBe(`Coderail version ${version}`);
                await expect(
                    Deno.stat(join(installation, 'instructions/skills/code/SKILL.md')),
                ).rejects.toThrow();
                expect(await Deno.readTextFile(join(installation, 'templates/personal.md'))).toBe(
                    'personal',
                );
            });
            // The same optional-resource archive also bootstraps a fresh root.
            const emptyInstallation = join(temporary, 'empty-installation');
            await Deno.mkdir(emptyInstallation);
            await checkPackage(canary, async (stage) => {
                const first = await activateDistribution(emptyInstallation, stage);
                expect(
                    await run(project, first.selectedExecutable, ['--no-color', '--version']),
                ).toBe(`Coderail version ${version}`);
            });
            console.log(
                `Native runtime smoke passed: ${native}. Other targets require matching downstream runners.`,
            );
        } finally {
            await Deno.remove(temporary, { recursive: true });
        }
    },
});
