import { join, toFileUrl } from '@std/path';

import { activateDistribution } from '../../src/installation/activation.ts';
import { targetTriple } from '../../src/installation/distribution.ts';
import { checkPackage, sha256 } from '../check-package.ts';
import { packageRelease } from './package-build.ts';
import { parsePackageArguments } from './package-options.ts';

async function run(cwd: string, executable: string, args: string[]): Promise<string> {
    const result = await new Deno.Command(executable, {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout).replaceAll('\x1b[0K', '').trim();
}

// Explicit package smoke CLI; no application suite or release API access.
if (import.meta.main) {
    const options = parsePackageArguments(Deno.args);
    if (options === 'help') {
        throw new Error('Use the same four options as tools/package.ts');
    }
    if (options.target !== targetTriple(Deno.build.os, Deno.build.arch)) {
        throw new Error('Smoke requires a matching native runner');
    }
    const temporary = await Deno.makeTempDir({ prefix: 'coderail-smoke-' });
    try {
        const installation = join(temporary, 'installation');
        const project = join(temporary, 'project');
        await Deno.mkdir(installation);
        await Deno.mkdir(project);
        const version = /CODERAIL_VERSION = '([^']+)'/.exec(
            await Deno.readTextFile('src/cli/version.ts'),
        )?.[1];
        if (!version || (options.version !== 'canary' && version !== options.version)) {
            throw new Error('Smoke source version mismatch');
        }
        const source = join(temporary, 'probe.ts');
        await Deno.writeTextFile(
            source,
            `
import { Commands } from ${JSON.stringify(toFileUrl(join(Deno.cwd(), 'src/commands.ts')).href)};
import { createContext } from ${JSON.stringify(toFileUrl(join(Deno.cwd(), 'src/runtime/context.ts')).href)};
const context = await createContext(Commands.cr().parseArguments([]).args, { requiresInit: false });
if (Deno.args[0]) {
    const path = context.resourceRoot + '/' + Deno.args[0];
    const bytes = await Deno.readFile(path);
    console.log(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''));
} else {
    console.log(context.resourceRoot);
}
`,
        );
        const probe = join(
            installation,
            'libexec',
            Deno.build.os === 'windows' ? 'probe.exe' : 'probe',
        );
        await Deno.mkdir(join(installation, 'libexec'));
        await run(Deno.cwd(), Deno.execPath(), [
            'compile',
            '-A',
            '--config',
            join(Deno.cwd(), 'deno.json'),
            '--output',
            probe,
            source,
        ]);
        const smoke = async (packageOptions: typeof options): Promise<void> => {
            const expectedVersion =
                packageOptions.version === 'canary'
                    ? `${version}-canary+sha.${packageOptions.commit.slice(0, 7)}`
                    : version;
            await checkPackage(packageOptions, async (stage) => {
                const active = await activateDistribution(installation, stage);
                if (
                    (await run(project, active.selectedExecutable, ['--no-color', '--version'])) !==
                    `Coderail version ${expectedVersion}`
                ) {
                    throw new Error('Executable version mismatch');
                }
                await run(project, active.selectedExecutable, ['init']);
                const expectedRoot = await Deno.realPath(installation);
                const actualRoot = await run(project, probe, []);
                if (actualRoot !== expectedRoot) {
                    throw new Error(
                        `Flattened runtime resource root mismatch: expected ${JSON.stringify(
                            expectedRoot,
                        )}, got ${JSON.stringify(actualRoot)}`,
                    );
                }
                for (const name of ['instructions', 'templates']) {
                    let probed = false;
                    const compare = async (path: string): Promise<void> => {
                        for await (const entry of Deno.readDir(join(stage.root, path))) {
                            const child = join(path, entry.name);
                            if (entry.isDirectory) {
                                await compare(child);
                            } else {
                                const actual = await Deno.readFile(join(installation, child));
                                const expected = await Deno.readFile(join(stage.root, child));
                                if (!probed) {
                                    if (
                                        (await run(project, probe, [child])) !==
                                        (await sha256(expected))
                                    ) {
                                        throw new Error(
                                            `Runtime resource lookup mismatch: ${child}`,
                                        );
                                    }
                                    probed = true;
                                }
                                if (
                                    actual.length !== expected.length ||
                                    actual.some((byte, index) => byte !== expected[index])
                                ) {
                                    throw new Error(`Installed resource mismatch: ${child}`);
                                }
                            }
                        }
                    };
                    try {
                        await Deno.stat(join(stage.root, name));
                    } catch (error) {
                        if (error instanceof Deno.errors.NotFound) {
                            continue;
                        }
                        throw error;
                    }
                    await compare(name);
                }
            });
        };
        await smoke(options);
        // A real second archive exercises upgrade from the stable installation.
        const canary = { ...options, version: 'canary', output: join(temporary, 'canary') };
        await packageRelease(canary);
        await smoke(canary);
        console.log(`Native version/resources/first-install/upgrade passed: ${options.target}`);
    } finally {
        await Deno.remove(temporary, { recursive: true });
    }
}
