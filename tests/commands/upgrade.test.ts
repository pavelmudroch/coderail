import type { Configuration } from '@conf';
import { Log } from '@log';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { Upgrade } from '../../src/commands/upgrade.ts';
import { launcherTarget, withInstallationLock } from '../../src/commands/upgrade/activation.ts';
import { DISTRIBUTION_MANIFEST } from '../../src/commands/upgrade/assets.ts';
import { targetTriple } from '../../src/commands/upgrade/distribution.ts';
import { InstallManifest } from '../../src/install-manifest.ts';
import { entries, fixture } from './upgrade/release-fixture.ts';

const rejectedArguments: { flags: string[]; message: string }[] = [
    ...['--unknown', '-z', '--versioned=1'].map((flag) => ({
        flags: [flag],
        message: `Unknown option "${flag}".`,
    })),
    ...['--help', '--canary', '--force', '--yes', '--no'].flatMap((flag) =>
        ['', 'true', 'false'].map((value) => ({
            flags: [`${flag}=${value}`],
            message: `Option "${flag}" does not take a value.`,
        })),
    ),
    ...[
        ['--canary', '--version', '1'],
        ['--version=1', '--canary'],
    ].map((flags) => ({
        flags,
        message: 'Options "--canary" and "--version" cannot be used together.',
    })),
    ...[
        ['--yes', '--no', '--force'],
        ['--no', '--yes', '--force'],
        ['-f', '-y', '-n'],
        ['--yes', '--no'],
    ].map((flags) => ({
        flags,
        message: 'Options "--yes" and "--no" cannot be used together.',
    })),
    ...['--yes', '--no', '-y', '-n'].map((flag) => ({
        flags: [flag],
        message: 'Options "--yes" and "--no" require "--force".',
    })),
    ...[
        ['--version'],
        ['--version', ''],
        ['--version', '--force'],
        ['--version', '-h'],
        ['--version='],
        ['--version=--force'],
    ].map((flags) => ({
        flags,
        message: 'Option "--version" requires a value.',
    })),
    ...[
        'v',
        '01',
        '1.02',
        '1.2.03',
        'v1.2.3.4',
        'canary',
        '1.2-rc',
        '1.2.3-rc',
        '1.2.3+build',
        'no',
        ' latest',
    ].flatMap((value) =>
        [['--version', value], [`--version=${value}`]].map((flags) => ({
            flags,
            message: 'Option "--version" must be latest, X, X.Y or X.Y.Z (optional v prefix).',
        })),
    ),
    ...['oops', '--', '1.2.3'].map((arg) => ({
        flags: [arg],
        message: arg.startsWith('-')
            ? `Unknown option "${arg}".`
            : `Unexpected upgrade argument "${arg}".`,
    })),
];

Deno.test('upgrade parses valid selectors, defaults and force aliases', () => {
    const command = new Upgrade();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([]).args).toEqual({
        help: false,
        list: false,
        canary: false,
        force: false,
        yes: false,
        no: false,
    });
    for (const version of [
        'latest',
        '0',
        'v0',
        '0.0',
        'v0.0.0',
        '1',
        'v1',
        '1.2',
        'v1.2',
        '1.2.3',
        'v1.2.3',
    ]) {
        for (const flags of [['--version', version], [`--version=${version}`]]) {
            expect(command.parseArguments(flags).args.version).toBe(version);
        }
    }
    expect(command.parseArguments(Array<string>(1)).args).toEqual(command.parseArguments([]).args);
    expect(command.parseArguments(['--canary']).args.canary).toBe(true);
    for (const force of ['-f', '--force']) {
        expect(command.parseArguments([force]).args.force).toBe(true);
        for (const answer of ['-y', '--yes', '-n', '--no']) {
            const args = command.parseArguments([force, answer]).args;
            expect(args.force).toBe(true);
            expect(args.yes).toBe(['-y', '--yes'].includes(answer));
            expect(args.no).toBe(['-n', '--no'].includes(answer));
        }
    }
});

Deno.test('upgrade rejects invalid arguments with specific diagnostics', () => {
    const command = new Upgrade();
    for (const { flags, message } of rejectedArguments) {
        expect(() => command.parseArguments(flags)).toThrow(message);
    }
});

Deno.test('upgrade early help and rejected invocations never fetch or mutate', async () => {
    await installation(async (root) => {
        const marker = join(root, 'personal');
        await Deno.writeTextFile(marker, 'unchanged');
        let requests = 0;
        const command = new Upgrade({
            fetcher: () => {
                requests++;
                throw new Error('Unexpected release request');
            },
        });
        for (const help of ['-h', '--help']) {
            const parsed = command.parseArguments(['--yes', '--no', help, '--unknown']);
            expect(command.shouldHandleHelp(parsed)).toBe(true);
            await command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: true } as Configuration,
                parsedArguments: parsed,
                signal: new AbortController().signal,
            });
        }
        for (const { flags, message } of rejectedArguments) {
            expect(() => command.parseArguments(flags)).toThrow(message);
        }
        expect(requests).toBe(0);
        expect(await Deno.readTextFile(marker)).toBe('unchanged');
        expect(Array.from(Deno.readDirSync(root), (entry) => entry.name)).toEqual(['personal']);
    });
});

Deno.test('upgrade help follows command formatting and retains release and conflict rules', () => {
    const lines = new Upgrade().getUsage().split('\n');
    for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(80);
        if (!line || line === 'Usage:' || line === 'Options:') {
            continue;
        }
        if (/^\s+--(?:version|canary|list)/.test(line)) {
            expect(line).toMatch(/^ {6}--/);
        } else if (/^\s+-[hfyn],/.test(line)) {
            expect(line).toMatch(/^ {2}-[hfyn],/);
        } else if (/^ {3,}/.test(line)) {
            expect(line).toMatch(/^ {23}\S/);
        } else {
            expect(line).toMatch(/^ {2}\S/);
        }
        if (/^\s+-[hfyn],/.test(line) || /^ {6}--canary/.test(line)) {
            expect(line.slice(23)).toMatch(/^\S/);
            expect(line.slice(0, 23).trim()).toMatch(/^(-[hfyn], )?--[a-z]+$/);
        }
    }
    const prose = lines
        .map((line) => line.trim())
        .join(' ')
        .replace(/\s+/g, ' ');
    for (const content of [
        'including the current version.',
        'latest (default), X / vX, X.Y / vX.Y, or X.Y.Z / vX.Y.Z.',
        'Latest selects GitHub’s designated stable release.',
        'Partial versions select the newest matching stable release.',
        'Exact versions permit downgrades.',
        'Select the latest unreleased build; excludes --version.',
        'Allow conflicting writes/removals with per-file confirmation.',
        'Approve conflicts automatically (requires --force).',
        'Decline conflicts automatically (requires --force).',
        'Unchanged managed files are updated without prompts;',
        'user templates are preserved.',
        'Conflicts fail before changes without --force.',
        'Noninteractive conflicts also need --yes or --no.',
        'These answers are mutually exclusive; declined files stay unchanged.',
    ]) {
        expect(prose).toContain(content);
    }
});

async function installation(run: (root: string) => Promise<void>): Promise<void> {
    const temp = await Deno.makeTempDir();
    const original = {
        info: Log.info,
        notice: Log.notice,
        progress: Log.progress,
        output: Log.output,
        warn: Log.warn,
        error: Log.error,
        confirm: Log.confirm,
    };
    try {
        captureLog([]);
        Log.progress = () => ({
            setMessage() {},
            setProgress() {},
            [Symbol.dispose]() {},
        });
        Log.confirm = () => {
            throw new Error('Unexpected confirmation');
        };
        const root = join(await Deno.realPath(temp), 'custom installation');
        await Deno.mkdir(root);
        await run(root);
    } finally {
        Object.assign(Log, original);
        await Deno.remove(temp, { recursive: true });
    }
}

function captureLog(messages: string[]): void {
    for (const level of ['info', 'notice', 'output', 'warn', 'error'] as const) {
        Log[level] = (...values) => {
            messages.push(values.map(String).join(' '));
        };
    }
}

async function commandFor(
    root: string,
    version = '2.10.0',
): Promise<{
    command: Upgrade;
    run: (flags?: string[], signal?: AbortSignal) => Promise<void>;
    messages: string[];
}> {
    const platform = targetTriple(Deno.build.os, Deno.build.arch);
    const release = {
        id: 1,
        tag_name: 'v' + version,
        draft: false,
        prerelease: false,
        target_commitish: 'a'.repeat(40),
        updated_at: 'today',
    };
    const mock = await fixture({
        entries: entries(version, platform),
        platform,
        releases: [release],
    });
    const messages: string[] = [];
    const command = new Upgrade({
        fetcher: mock.fetcher,
    });
    return {
        command,
        messages,
        run: (flags = [], signal = new AbortController().signal) => {
            captureLog(messages);
            return command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: true } as Configuration,
                parsedArguments: command.parseArguments(flags),
                signal,
            });
        },
    };
}

Deno.test('latest request failures leave the installation unchanged', async () => {
    await installation(async (root) => {
        const marker = join(root, 'personal');
        await Deno.writeTextFile(marker, 'unchanged');
        for (const flags of [[], ['--version', 'latest']]) {
            const calls: string[] = [];
            const command = new Upgrade({
                fetcher: (input) => {
                    calls.push(String(input));
                    return Promise.resolve(new Response(null, { status: 404 }));
                },
            });
            await expect(
                command.run({
                    context: { installRoot: root, currentWorkingDirectory: root },
                    configuration: { nonInteractive: true } as Configuration,
                    parsedArguments: command.parseArguments(flags),
                    signal: new AbortController().signal,
                }),
            ).rejects.toThrow('GitHub request failed (404): /releases/latest');
            expect(calls.length).toBe(1);
            expect(await Deno.readTextFile(marker)).toBe('unchanged');
            expect(Array.from(Deno.readDirSync(root), (entry) => entry.name)).toEqual(['personal']);
        }
    });
});

Deno.test(
    'upgrade bootstraps a custom root, restores same version and permits downgrades',
    async () => {
        await installation(async (root) => {
            const first = await commandFor(root);
            await first.run();
            const target = await launcherTarget(root, Deno.build.os === 'windows');
            expect(target).toContain('cr-2.10.0');
            await Deno.remove(join(root, 'instructions/a.md'));
            await Deno.writeTextFile(join(root, 'templates/personal'), 'personal');
            await first.run();
            expect(await Deno.readTextFile(join(root, 'instructions/a.md'))).toBe('instruction');
            expect(await launcherTarget(root, Deno.build.os === 'windows')).toBe(target);
            const older = await commandFor(root, '1.0.0');
            await older.run(['--version', 'v1']);
            expect(await launcherTarget(root, Deno.build.os === 'windows')).toContain('cr-1.0.0');
            expect(await Deno.readTextFile(join(root, 'templates/personal'))).toBe('personal');
            const output = first.messages.join('\n');
            expect(output).toContain('Activated');
            expect(output).toContain('Completed writes (');
            expect(output).toContain(`"${join(root, 'instructions/a.md')}"`);
            expect(output).toContain('Manifest saved: yes');
            expect(output).toContain('Skipped (0)');
        });
    },
);

Deno.test(
    'upgrade conflict preflight, declines and approvals preserve actual baselines',
    async () => {
        await installation(async (root) => {
            await Deno.mkdir(join(root, 'templates'));
            await Deno.writeTextFile(join(root, 'templates/default.md'), 'personal');
            const { run, messages } = await commandFor(root);
            await expect(run()).rejects.toThrow('force');
            expect(messages.join('\n')).toContain(`preflight failed for installation "${root}"`);
            expect(messages.join('\n')).toContain('installed files were not changed');
            expect(messages.join('\n')).not.toContain('partially changed');
            await expect(Deno.stat(join(root, 'bin'))).rejects.toThrow();
            await expect(run(['--force'])).rejects.toThrow('confirmation');
            await run(['--force', '--no']);
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe('personal');
            const manifest = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
            expect(manifest?.files.some((file) => file.path === 'templates/default.md')).toBe(
                false,
            );
            expect(messages.join('\n')).toContain('Declined');
            expect(messages.join('\n')).toContain(
                `Skipped (1)\n"${join(root, 'templates/default.md')}"`,
            );
            await run(['--force', '--yes']);
            expect(await Deno.readTextFile(join(root, 'templates/default.md'))).toBe('template');
        });
    },
);

Deno.test('upgrade contention and cancellation never activate', async () => {
    await installation(async (root) => {
        const { run } = await commandFor(root);
        await withInstallationLock(root, async () => {
            await expect(run()).rejects.toThrow('busy');
        });
        const controller = new AbortController();
        controller.abort();
        await expect(run([], controller.signal)).rejects.toThrow();
        await expect(Deno.stat(join(root, 'bin'))).rejects.toThrow();
    });
});

Deno.test(
    'release validation and cancellation during confirmation leave custom roots unchanged',
    async () => {
        await installation(async (root) => {
            await Deno.mkdir(join(root, 'templates'));
            const template = join(root, 'templates/default.md');
            await Deno.writeTextFile(template, 'personal');
            const platform = targetTriple(Deno.build.os, Deno.build.arch);
            for (const invalid of [true, false]) {
                const mock = await fixture({
                    platform,
                    entries: entries(invalid ? '1.0.0' : '2.10.0', platform),
                });
                const controller = new AbortController();
                const messages: string[] = [];
                let confirmations = 0;
                captureLog(messages);
                Log.confirm = (message) => {
                    expect(message).toContain(`"${template}"`);
                    confirmations++;
                    controller.abort();
                    return true;
                };
                const command = new Upgrade({
                    fetcher: mock.fetcher,
                    interactive: true,
                });
                await expect(
                    command.run({
                        context: { installRoot: root, currentWorkingDirectory: root },
                        configuration: { nonInteractive: true } as Configuration,
                        parsedArguments: command.parseArguments(['--force']),
                        signal: controller.signal,
                    }),
                ).rejects.toThrow();
                expect(confirmations).toBe(invalid ? 0 : 1);
                expect(messages.join('\n')).toContain(
                    `preflight failed for installation "${root}"`,
                );
                expect(messages.join('\n')).not.toContain('partially changed');
                expect(await Deno.readTextFile(template)).toBe('personal');
                expect(Array.from(Deno.readDirSync(root), (entry) => entry.name)).toEqual([
                    'templates',
                ]);
            }
        });
    },
);

Deno.test(
    'all confirmations precede stale cleanup, then assets, manifest, activation and retirement',
    async () => {
        await installation(async (root) => {
            await (await commandFor(root, '1.0.0')).run();
            const previous = await launcherTarget(root, Deno.build.os === 'windows');
            // Keep a stale owned binary distinct from the running and current targets.
            const stale = join(root, 'libexec', 'cr-0.1.0');
            await Deno.writeTextFile(stale, 'stale');
            const { fingerprint } = await import('../../src/install-manifest/capture.ts');
            const manifest = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
            if (!manifest) {
                throw new Error('Missing manifest');
            }
            manifest.files.push({
                path: 'libexec/cr-0.1.0',
                ...(await fingerprint(stale)),
            });
            await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), manifest);
            await Deno.writeTextFile(join(root, 'templates/default.md'), 'edited');
            await Deno.writeTextFile(join(root, 'instructions/a.md'), 'edited');
            const platform = targetTriple(Deno.build.os, Deno.build.arch);
            const mock = await fixture({
                platform,
                entries: entries('2.10.0', platform),
            });
            const events: string[] = [];
            captureLog([]);
            Log.confirm = () => {
                expect(mock.calls.filter((call) => call.includes('/releases/assets/')).length).toBe(
                    2,
                );
                expect(Deno.readTextFileSync(stale)).toBe('stale');
                events.push('confirm');
                return true;
            };
            const command = new Upgrade({
                fetcher: mock.fetcher,
                interactive: true,
            });
            const remove = Deno.remove;
            const copy = Deno.copyFile;
            const rename = Deno.rename;
            Deno.remove = async (path, options) => {
                if (String(path) === stale) {
                    events.push('stale');
                }
                if (String(path) === previous) {
                    events.push('retire');
                }
                return await remove(path, options);
            };
            Deno.copyFile = async (source, destination) => {
                if (String(destination).startsWith(root)) {
                    events.push('asset');
                }
                return await copy(source, destination);
            };
            Deno.rename = async (source, destination) => {
                if (String(destination) === join(root, DISTRIBUTION_MANIFEST)) {
                    events.push('manifest');
                }
                if (String(destination).startsWith(join(root, 'bin'))) {
                    events.push('activate');
                }
                return await rename(source, destination);
            };
            try {
                await command.run({
                    context: { installRoot: root, currentWorkingDirectory: root },
                    configuration: { nonInteractive: true } as Configuration,
                    parsedArguments: command.parseArguments(['--force']),
                    signal: new AbortController().signal,
                });
            } finally {
                Deno.remove = remove;
                Deno.copyFile = copy;
                Deno.rename = rename;
            }
            expect(events.slice(0, 3)).toEqual(['confirm', 'confirm', 'stale']);
            expect(events.indexOf('asset')).toBeGreaterThan(events.indexOf('stale'));
            expect(events.indexOf('asset')).toBeLessThan(events.indexOf('activate'));
            expect(events.filter((event) => event === 'manifest').length).toBeGreaterThanOrEqual(2);
            expect(events.indexOf('manifest', events.indexOf('asset'))).toBeLessThan(
                events.indexOf('activate'),
            );
            expect(events.indexOf('retire')).toBeGreaterThan(events.indexOf('activate'));
            expect(
                (await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST)))?.files.some(
                    (file) => file.path === 'libexec/cr-0.1.0',
                ),
            ).toBe(false);
        });
    },
);

Deno.test(
    'asset, manifest and activation failures report partial progress and custom-root recovery',
    async () => {
        for (const failure of ['binary', 'asset', 'manifest', 'activation']) {
            await installation(async (root) => {
                const initial = await commandFor(root);
                await initial.run();
                const original = await launcherTarget(root, Deno.build.os === 'windows');
                const next = await commandFor(root, '1.0.0');
                const copy = Deno.copyFile;
                const rename = Deno.rename;
                const open = Deno.open;
                Deno.open = (path, options) =>
                    failure === 'binary' && String(path).startsWith(join(root, 'libexec'))
                        ? Promise.reject(new Error('injected binary staging failure'))
                        : open(path, options);
                Deno.copyFile = (source, destination) => {
                    if (failure === 'asset' && String(destination).startsWith(root)) {
                        return Promise.reject(new Error('injected asset failure'));
                    }
                    return copy(source, destination);
                };
                Deno.rename = (source, destination) => {
                    if (
                        (failure === 'manifest' &&
                            String(destination) === join(root, DISTRIBUTION_MANIFEST)) ||
                        (failure === 'activation' &&
                            String(destination).startsWith(join(root, 'bin')))
                    ) {
                        return Promise.reject(new Error('injected rename failure'));
                    }
                    return rename(source, destination);
                };
                try {
                    await expect(next.run()).rejects.toThrow();
                } finally {
                    Deno.copyFile = copy;
                    Deno.rename = rename;
                    Deno.open = open;
                }
                expect(await launcherTarget(root, Deno.build.os === 'windows')).toBe(original);
                const output = next.messages.join('\n');
                expect(output).toContain(root);
                expect(output).toContain('partially changed');
                expect(output).toContain('Activation did not complete');
                expect(output).toContain('Preserve user templates');
                expect(output).toContain('curl -fsSL');
                expect(output).toContain('install.sh');
                if (failure === 'binary') {
                    expect(output).toContain('Completed writes: unknown');
                    expect(output).toContain('Completed removals: unknown');
                    expect(output).toContain(
                        'Manifest saved: unknown; inspect the distribution manifest',
                    );
                } else if (failure === 'asset') {
                    expect(output).toContain('Completed writes (0)');
                    expect(output).toContain('Completed removals (0)');
                    expect(output).toContain('Manifest saved: yes');
                } else {
                    expect(output).toContain('Completed writes (2)');
                    expect(output).toContain(`"${join(root, 'instructions/a.md')}"`);
                    expect(output).toContain('Completed removals (0)');
                    expect(output).toContain(
                        failure === 'manifest' ? 'Manifest saved: no' : 'Manifest saved: yes',
                    );
                    expect(output).not.toContain('unknown');
                }
            });
        }
    },
);

Deno.test(
    'mid-apply failures report only completed writes and removals before saving ownership',
    async () => {
        for (const failure of ['write', 'remove']) {
            await installation(async (root) => {
                await (await commandFor(root)).run();
                const original = await launcherTarget(root, Deno.build.os === 'windows');
                const manifest = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
                if (!manifest) {
                    throw new Error('Missing manifest');
                }
                const { fingerprint } = await import('../../src/install-manifest/capture.ts');
                for (const name of ['obsolete-one', 'obsolete-two']) {
                    const path = `templates/${name}`;
                    await Deno.writeTextFile(join(root, path), name);
                    manifest.files.push({
                        path,
                        ...(await fingerprint(join(root, path))),
                    });
                }
                await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), manifest);
                const next = await commandFor(root, '1.0.0');
                const copy = Deno.copyFile;
                const lstat = Deno.lstat;
                let writing = false;
                Deno.copyFile = (source, destination) => {
                    writing = true;
                    return failure === 'write' &&
                        String(destination) === join(root, 'templates/default.md')
                        ? Promise.reject(new Error('second write failed'))
                        : copy(source, destination);
                };
                Deno.lstat = (path) =>
                    failure === 'remove' &&
                    writing &&
                    String(path) === join(root, 'templates/obsolete-two')
                        ? Promise.reject(new Error('second removal inspection failed'))
                        : lstat(path);
                try {
                    await expect(next.run()).rejects.toThrow();
                } finally {
                    Deno.copyFile = copy;
                    Deno.lstat = lstat;
                }
                const output = next.messages.join('\n');
                expect(output).toContain('Manifest saved: yes');
                expect(output).toContain('Activation did not complete');
                expect(output).not.toContain('Activated');
                expect(await launcherTarget(root, Deno.build.os === 'windows')).toBe(original);
                expect(output).toContain(`"${join(root, 'instructions/a.md')}"`);
                const saved = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
                if (failure === 'write') {
                    expect(output).toContain('Completed writes (1)');
                    expect(output).not.toContain(join(root, 'templates/default.md'));
                    expect(output).toContain('Completed removals (0)');
                } else {
                    expect(output).toContain('Completed writes (2)');
                    expect(output).toContain(
                        `Completed removals (1)\n"${join(root, 'templates/obsolete-one')}"`,
                    );
                    expect(
                        saved?.files.some((file) => file.path === 'templates/obsolete-one'),
                    ).toBe(false);
                    await expect(Deno.stat(join(root, 'templates/obsolete-one'))).rejects.toThrow();
                }
                expect(saved?.files.some((file) => file.path === 'templates/obsolete-two')).toBe(
                    true,
                );
                expect(await Deno.readTextFile(join(root, 'templates/obsolete-two'))).toBe(
                    'obsolete-two',
                );
            });
        }
    },
);

Deno.test(
    'physical bootstrap binary is reused; retired binaries and residual failures are reported',
    async () => {
        await installation(async (root) => {
            const platform = targetTriple(Deno.build.os, Deno.build.arch);
            const contents = entries('2.10.0', platform);
            const binary = contents[0];
            if (!binary) {
                throw new Error('Missing fixture binary');
            }
            await Deno.mkdir(join(root, 'libexec'));
            const running = join(
                root,
                'libexec',
                Deno.build.os === 'windows' ? 'cr-2.10.0.exe' : 'cr-2.10.0',
            );
            await Deno.writeFile(running, binary.data);
            const mock = await fixture({ platform, entries: contents });
            const command = new Upgrade({
                fetcher: mock.fetcher,
                runningExecutable: running,
            });
            await command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: true } as Configuration,
                parsedArguments: command.parseArguments([]),
                signal: new AbortController().signal,
            });
            expect(await launcherTarget(root, Deno.build.os === 'windows')).toBe(running);
            const next = await commandFor(root, '1.0.0');
            const remove = Deno.remove;
            Deno.remove = (path, options) =>
                String(path) === running
                    ? Promise.reject(new Error('file in use'))
                    : remove(path, options);
            try {
                await next.run();
            } finally {
                Deno.remove = remove;
            }
            expect(next.messages.join('\n')).toContain('Residual executable');
            expect(await launcherTarget(root, Deno.build.os === 'windows')).toContain('cr-1.0.0');
            await next.run();
            await expect(Deno.stat(running)).rejects.toThrow();
        });
    },
);

// Native launcher behavior is exercised by upgrade/activation.test.ts on its host.
// Windows forwarding and deferred cleanup fixtures run on all hosts; these tests
// do not claim native Windows process execution when run on macOS or Linux.

Deno.test(
    'default adapters handle help, interactive removals, cancellation and stale cleanup residuals',
    async () => {
        const fetcher = globalThis.fetch;
        const confirm = Log.confirm;
        const info = Log.info;
        const output = Log.output;
        const warn = Log.warn;
        const error = Log.error;
        const nonInteractive = Log.nonInteractive;
        const terminal = Deno.stdin.isTerminal;
        try {
            await installation(async (root) => {
                const platform = targetTriple(Deno.build.os, Deno.build.arch);
                const mock = await fixture({
                    platform,
                    entries: entries('2.10.0', platform),
                });
                globalThis.fetch = mock.fetcher;
                const messages: string[] = [];
                const warnings: string[] = [];
                const errors: string[] = [];
                Log.info = (message) => messages.push(String(message));
                Log.notice = (message) => messages.push(String(message));
                Log.output = (message) => messages.push(String(message));
                Log.warn = (message) => warnings.push(String(message));
                Log.error = (message) => errors.push(String(message));
                Log.confirm = () => true;
                Log.nonInteractive = false;
                Deno.stdin.isTerminal = () => true;
                const command = new Upgrade();
                const run = (flags: string[]): Promise<void> =>
                    command.run({
                        context: { installRoot: root, currentWorkingDirectory: root },
                        configuration: { nonInteractive: true } as Configuration,
                        parsedArguments: command.parseArguments(flags),
                        signal: new AbortController().signal,
                    });
                await run(['--help']);
                expect(mock.calls).toEqual([]);
                await run([]);
                const obsolete = join(root, 'templates/obsolete');
                await Deno.writeTextFile(obsolete, 'old');
                const { fingerprint } = await import('../../src/install-manifest/capture.ts');
                const manifest = await InstallManifest.load(join(root, DISTRIBUTION_MANIFEST));
                if (!manifest) {
                    throw new Error('Missing manifest');
                }
                manifest.files.push({
                    path: 'templates/obsolete',
                    ...(await fingerprint(obsolete)),
                });
                await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), manifest);
                await Deno.writeTextFile(obsolete, 'edited');
                await Deno.writeTextFile(join(root, 'templates/default.md'), 'edited');
                const rename = Deno.rename;
                Deno.rename = (source, destination) =>
                    String(destination) === join(root, DISTRIBUTION_MANIFEST)
                        ? Promise.reject(new Error('save failed'))
                        : rename(source, destination);
                try {
                    await expect(run(['--force'])).rejects.toThrow();
                    expect(messages.join('\n')).toContain(
                        `Completed removals (1)\n"${obsolete}"\nManifest saved: no`,
                    );
                    expect(errors.join('\n')).toContain('Activation did not complete');
                } finally {
                    Deno.rename = rename;
                }
                const { Fs } = await import('@fs');
                await Fs.cleanup();
                // Removal succeeded even though manifest persistence failed; the next run reconciles it.
                await expect(Deno.stat(obsolete)).rejects.toThrow();
                await run(['--force']);
                const stale = join(root, 'libexec/cr-stale');
                await Deno.writeTextFile(stale, 'stale');
                const currentManifest = await InstallManifest.load(
                    join(root, DISTRIBUTION_MANIFEST),
                );
                if (!currentManifest) {
                    throw new Error('Missing manifest');
                }
                currentManifest.files.push({
                    path: 'libexec/cr-stale',
                    ...(await fingerprint(stale)),
                });
                await InstallManifest.save(join(root, DISTRIBUTION_MANIFEST), currentManifest);
                const remove = Deno.remove;
                let staging: string | undefined;
                Deno.remove = (path, options) => {
                    if (String(path) === stale) {
                        return Promise.reject(new Error('in use'));
                    }
                    if (String(path).includes('coderail-upgrade-') && options?.recursive) {
                        staging = String(path);
                        return Promise.reject(new Error('staging cleanup failed'));
                    }
                    return remove(path, options);
                };
                try {
                    await expect(run([])).rejects.toThrow('staging cleanup failed');
                    expect(warnings.join('\n')).toContain(
                        `Residual executable ${stale}: Error: in use`,
                    );
                    expect(errors.join('\n')).toContain('Activation completed');
                    expect(messages.join('\n')).toContain('Manifest saved: yes');
                } finally {
                    Deno.remove = remove;
                    if (staging) {
                        await remove(staging, { recursive: true });
                    }
                }
            });
        } finally {
            globalThis.fetch = fetcher;
            Log.confirm = confirm;
            Log.info = info;
            Log.output = output;
            Log.warn = warn;
            Log.error = error;
            Log.nonInteractive = nonInteractive;
            Deno.stdin.isTerminal = terminal;
        }
    },
);

Deno.test('optional resources do not bypass release asset preflight before mutation', async () => {
    for (const failure of ['missing', 'changing']) {
        await installation(async (root) => {
            await Deno.mkdir(join(root, 'templates'));
            const personal = join(root, 'templates/personal.md');
            await Deno.writeTextFile(personal, 'personal');
            const platform = targetTriple(Deno.build.os, Deno.build.arch);
            const mock = await fixture({
                platform,
                entries: entries('2.10.0', platform).filter(
                    (entry) =>
                        !entry.name.startsWith('instructions/') &&
                        !entry.name.startsWith('templates/'),
                ),
            });
            if (failure === 'missing') {
                mock.assets.pop();
            }
            const fetcher: typeof fetch = async (input, init) => {
                const response = await mock.fetcher(input, init);
                if (failure === 'changing' && String(input).endsWith('/releases/assets/10')) {
                    const asset = mock.assets[0];
                    if (!asset) {
                        throw new Error('Missing fixture asset');
                    }
                    asset.updated_at = 'changed';
                }
                return response;
            };
            let prompts = 0;
            captureLog([]);
            Log.confirm = () => {
                prompts++;
                return true;
            };
            const command = new Upgrade({
                fetcher,
                interactive: true,
            });
            await expect(
                command.run({
                    context: { installRoot: root, currentWorkingDirectory: root },
                    configuration: { nonInteractive: true } as Configuration,
                    parsedArguments: command.parseArguments([]),
                    signal: new AbortController().signal,
                }),
            ).rejects.toThrow();
            expect(prompts).toBe(0);
            expect(await Deno.readTextFile(personal)).toBe('personal');
            expect(Array.from(Deno.readDirSync(root), (entry) => entry.name)).toEqual([
                'templates',
            ]);
        });
    }
});

Deno.test('PATH setup follows activation and respects explicit noninteractive mode', async () => {
    await installation(async (root) => {
        const platform = targetTriple(Deno.build.os, Deno.build.arch);
        const mock = await fixture({
            platform,
            entries: entries('2.10.0', platform),
        });
        let calls = 0;
        const messages: string[] = [];
        Log.warn = (message) => messages.push(String(message));
        const command = new Upgrade({
            fetcher: mock.fetcher,
            pathSetup: async (options) => {
                calls++;
                expect(options.bin).toBe(join(root, 'bin'));
                expect(options.confirm).toBeUndefined();
                expect(await launcherTarget(root, Deno.build.os === 'windows')).toContain(
                    'cr-2.10.0',
                );
                throw new Error('PATH failed');
            },
        });
        const run = (): Promise<void> =>
            command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: true } as Configuration,
                parsedArguments: command.parseArguments([]),
                signal: new AbortController().signal,
            });
        await run();
        await run();
        expect(calls).toBe(2);
        expect(messages.join('\n')).toContain('PATH failed');
    });
});

Deno.test(
    'PATH consent is separate from overwrite flags and failed upgrades skip setup',
    async () => {
        await installation(async (root) => {
            const platform = targetTriple(Deno.build.os, Deno.build.arch);
            const mock = await fixture({
                platform,
                entries: entries('2.10.0', platform),
            });
            let calls = 0;
            captureLog([]);
            const command = new Upgrade({
                fetcher: mock.fetcher,
                pathSetup: async (options) => {
                    calls++;
                    expect(options.confirm).toBeDefined();
                    const openSync = Deno.openSync;
                    const devices: string[] = [];
                    try {
                        Deno.openSync = (path) => {
                            devices.push(String(path));
                            throw new Deno.errors.NotFound('No terminal in this test');
                        };
                        expect(await options.confirm?.()).toBe(false);
                    } finally {
                        Deno.openSync = openSync;
                    }
                    expect(devices).toEqual([Deno.build.os === 'windows' ? 'CON' : '/dev/tty']);
                    expect(await launcherTarget(root, Deno.build.os === 'windows')).toContain(
                        'cr-2.10.0',
                    );
                },
            });
            await command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: false } as Configuration,
                parsedArguments: command.parseArguments(['--force']),
                signal: new AbortController().signal,
            });
            expect(calls).toBe(1);
            captureLog([]);
            const failed = new Upgrade({
                fetcher: () => Promise.resolve(new Response(null, { status: 404 })),
                pathSetup: () => {
                    calls++;
                    return Promise.resolve();
                },
            });
            await expect(
                failed.run({
                    context: { installRoot: root, currentWorkingDirectory: root },
                    configuration: { nonInteractive: true } as Configuration,
                    parsedArguments: failed.parseArguments([]),
                    signal: new AbortController().signal,
                }),
            ).rejects.toThrow();
            expect(calls).toBe(1);
        });
    },
);

Deno.test('upgrade listing rejects incompatible options', () => {
    const command = new Upgrade();
    for (const flags of [
        ['--list', '--version=1'],
        ['--version', '1', '--list'],
        ['--list', '--force'],
        ['--list', '--yes'],
        ['--list', '--no'],
        ['--list', '--canary'],
        ['--list', '-f'],
        ['--list', '-y'],
        ['--list', '-n'],
    ]) {
        expect(() => command.parseArguments(flags)).toThrow();
    }
    for (const value of ['', 'true', 'false']) {
        expect(() => command.parseArguments([`--list=${value}`])).toThrow();
    }
});

Deno.test('listing prints markers and never changes the installation, even on errors', async () => {
    await installation(async (root) => {
        const publication = (
            tag_name: string,
        ): {
            id: number;
            tag_name: string;
            draft: boolean;
            prerelease: boolean;
            target_commitish: string;
            updated_at: string;
        } => ({
            id: 1,
            tag_name,
            draft: false,
            prerelease: false,
            target_commitish: 'a'.repeat(40),
            updated_at: 'today',
        });
        const releases = [publication('1.4.2'), publication('v1.5.0'), publication('v1.4.3')];
        for (const scenario of [
            {
                current: '1.4.3',
                latest: '1.4.3',
                expected: ['1.5.0', '1.4.3 (latest, current)', '1.4.2'],
            },
            {
                current: '1.4.2',
                latest: '1.4.3',
                expected: ['1.5.0', '1.4.3 (latest)', '1.4.2 (current)'],
            },
            {
                current: 'canary',
                latest: '1.4.3',
                expected: ['1.5.0', '1.4.3 (latest)', '1.4.2'],
            },
            { current: undefined, latest: '1.4.3', expected: ['1.5.0', '1.4.3 (latest)', '1.4.2'] },
            {
                current: '9.0.0',
                latest: '9.1.0',
                expected: ['1.5.0', '1.4.3', '1.4.2'],
            },
        ]) {
            const messages: string[] = [];
            const calls: string[] = [];
            captureLog([]);
            Log.output = (message) => messages.push(String(message));
            Log.confirm = () => {
                throw new Error('unexpected prompt');
            };
            const command = new Upgrade({
                currentVersion: scenario.current,
                fetcher: (input) => {
                    const url = String(input);
                    calls.push(url);
                    return Promise.resolve(
                        Response.json(
                            url.includes('/latest') ? publication(scenario.latest) : releases,
                        ),
                    );
                },
                pathSetup: () => {
                    throw new Error('unexpected PATH setup');
                },
            });
            await command.run({
                context: { installRoot: root, currentWorkingDirectory: root },
                configuration: { nonInteractive: true } as Configuration,
                parsedArguments: command.parseArguments(['--list']),
                signal: new AbortController().signal,
            });
            expect(messages).toEqual([
                scenario.expected
                    .map((line) =>
                        line.includes('current')
                            ? Log.color.green(line)
                            : line.includes('latest')
                              ? Log.color.yellow(line)
                              : line,
                    )
                    .join('\n'),
            ]);
            expect(calls.length).toBe(2);
            expect(calls.every((url) => !url.includes('/assets'))).toBe(true);
            expect([...Deno.readDirSync(root)]).toEqual([]);
        }
        for (const failure of ['empty', 'list', 'latest']) {
            const calls: string[] = [];
            captureLog([]);
            Log.confirm = () => {
                throw new Error('unexpected prompt');
            };
            const command = new Upgrade({
                fetcher: (input) => {
                    const url = String(input);
                    calls.push(url);
                    return Promise.resolve(
                        failure === 'list' || (failure === 'latest' && url.includes('/latest'))
                            ? new Response('', { status: 404 })
                            : Response.json(failure === 'empty' ? [] : releases),
                    );
                },
                pathSetup: () => {
                    throw new Error('unexpected PATH setup');
                },
            });
            await expect(
                command.run({
                    context: { installRoot: root, currentWorkingDirectory: root },
                    configuration: { nonInteractive: true } as Configuration,
                    parsedArguments: command.parseArguments(['--list']),
                    signal: new AbortController().signal,
                }),
            ).rejects.toThrow(failure === 'empty' ? 'No stable releases' : 'GitHub request failed');
            expect(calls.every((url) => !url.includes('/assets'))).toBe(true);
            expect([...Deno.readDirSync(root)]).toEqual([]);
        }
    });
});
