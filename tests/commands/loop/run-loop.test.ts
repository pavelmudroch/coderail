import type { HarnessConnector, Runner, RunRequest } from '@harness';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { assertCleanProject, stageProject } from '../../../src/commands/loop/git.ts';
import { preflightPrompt, runLoop } from '../../../src/commands/loop/run-loop.ts';
import { ClaudeConnector } from '../../../src/harness/claude.ts';
import { CodexConnector } from '../../../src/harness/codex.ts';

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout);
}
async function fixture(run: (root: string, project: string) => Promise<void>): Promise<void> {
    const root = await Deno.makeTempDir();
    const project = join(root, 'nested');
    await Deno.mkdir(project);
    await git(root, 'init', '-q');
    await git(root, 'config', 'user.email', 'test@example.com');
    await git(root, 'config', 'user.name', 'Test');
    await git(root, 'config', 'commit.gpgsign', 'false');
    await Deno.writeTextFile(join(root, '.gitignore'), '**/.coderail/loop/\n');
    await Deno.writeTextFile(join(root, 'outside'), 'baseline');
    await ticket(project, '0001');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'baseline');
    try {
        await run(root, project);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}
async function ticket(project: string, id: string, dependencies: string[] = []): Promise<void> {
    const directory = join(project, '.coderail/tickets/open');
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(
        join(directory, `${id}-ticket.md`),
        `---\ntitle: Ticket ${id}\nstatus: open\ndependencies: ${JSON.stringify(
            dependencies,
        )}\n---\nWork\n`,
    );
}
async function close(project: string, id: string, reason = 'done'): Promise<void> {
    const directory = join(project, '.coderail/tickets');
    const path = join(directory, 'open', `${id}-ticket.md`);
    const content = (await Deno.readTextFile(path)).replace(
        'status: open',
        `status: closed\nreason: ${reason}`,
    );
    await Deno.mkdir(join(directory, 'closed'), { recursive: true });
    await Deno.writeTextFile(join(directory, 'closed', `${id}-ticket.md`), content);
    await Deno.remove(path);
}
function connector(
    execute: (request: RunRequest, index: number) => Promise<string>,
    calls: RunRequest[],
    disposed: number[],
): Pick<HarnessConnector, 'run' | 'translatePrompt'> {
    return {
        translatePrompt: (prompt) => prompt.replaceAll(/<skill>([^<]+)<\/skill>/g, '$$$1'),
        run: async (request): Promise<Runner> => {
            calls.push(request);
            const finalMessage = await execute(request, calls.length);
            return {
                async *[Symbol.asyncIterator]() {
                    yield {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        stream: 'stderr' as const,
                        output: 'raw\npartial',
                    };
                    yield {
                        timestamp: '2026-01-01T00:00:01.000Z',
                        stream: 'stdout' as const,
                        output: '{native event}',
                    };
                },
                result: () => Promise.resolve({ finalMessage }),
                [Symbol.asyncDispose]: () => {
                    disposed.push(calls.length);
                    return Promise.resolve();
                },
            };
        },
    };
}

Deno.test(
    'Loop sends native skill invocations through the selected harness translator',
    async () => {
        for (const [Connector, prefix] of [
            [CodexConnector, '$'],
            [ClaudeConnector, '/'],
        ] as const) {
            await fixture(async (root, project) => {
                using native = new Connector({ scope: 'local', projectRoot: project });
                const calls: RunRequest[] = [];
                const harness = connector(
                    async (request) => {
                        expect(request.prompt).not.toContain('<skill>');
                        if (request.prompt.startsWith(`${prefix}implement`)) {
                            await close(project, '0001');
                        } else if (request.prompt.includes(`${prefix}commit`)) {
                            await git(root, 'commit', '-qm', 'completed ticket');
                        }
                        return 'OK';
                    },
                    calls,
                    [],
                );
                harness.translatePrompt = (prompt) => native.translatePrompt(prompt);
                const result = await runLoop({
                    projectRoot: project,
                    connector: harness,
                    settings: {},
                    reviewSettings: {},
                    commitSettings: {},
                    signal: new AbortController().signal,
                });
                expect(result.attempts).toBe(1);
                expect(calls.map((call) => call.prompt)).toEqual([
                    preflightPrompt,
                    expect.stringContaining(`${prefix}implement`),
                    expect.stringContaining('<review-instructions>'),
                    expect.stringContaining(`${prefix}commit`),
                ]);
            });
        }
    },
);

Deno.test(
    'Loop scopes startup and staging to nested project, preserving outside index',
    async () => {
        await fixture(async (root, project) => {
            await Deno.writeTextFile(join(root, 'outside'), 'staged');
            await git(root, 'add', 'outside');
            await Deno.writeTextFile(join(root, 'outside'), 'unstaged');
            await Deno.writeTextFile(join(root, 'untracked'), 'outside');
            await assertCleanProject(project);
            for (const mode of ['untracked', 'unstaged', 'staged']) {
                const path = join(project, 'file with spaces');
                await Deno.writeTextFile(path, mode);
                if (mode !== 'untracked') {
                    await git(root, 'add', 'nested');
                }
                if (mode === 'unstaged') {
                    await Deno.writeTextFile(path, 'changed');
                }
                await expect(assertCleanProject(project)).rejects.toThrow();
                await git(root, 'reset', '-q', '--', 'nested');
                await Deno.remove(path);
            }
            await Deno.writeTextFile(join(project, 'new file'), 'new');
            await close(project, '0001');
            await stageProject(project);
            expect(await git(root, 'show', ':outside')).toBe('staged');
            expect(await Deno.readTextFile(join(root, 'outside'))).toBe('unstaged');
            expect(await git(root, 'show', ':nested/new file')).toBe('new');
            expect(await git(root, 'diff', '--cached', '--name-status')).toContain(
                'nested/.coderail/tickets/closed',
            );
        });
    },
);

Deno.test(
    'Loop preflights once then reselects dependencies, stages repeated file edits and logs raw chunks',
    async () => {
        await fixture(async (root, project) => {
            await ticket(project, '0002', ['0001']);
            await git(root, 'add', '.');
            await git(root, 'commit', '-qm', 'dependent');
            const calls: RunRequest[] = [];
            const disposed: number[] = [];
            const reports: string[] = [];
            const harness = connector(
                async (request, index) => {
                    expect(request.cwd).toBe(project);
                    if (index === 1) {
                        expect(request.prompt).toBe(preflightPrompt);
                        return ' OK\n';
                    }
                    const id = index === 2 ? '0001' : '0002';
                    expect(request.prompt).toContain(`${id}-ticket.md`);
                    await Deno.writeTextFile(join(project, 'same'), id);
                    await close(project, id);
                    return 'done';
                },
                calls,
                disposed,
            );
            const result = await runLoop({
                projectRoot: project,
                connector: harness,
                settings: { model: 'Native', effort: 'HIGH' },
                signal: new AbortController().signal,
                report: (line) => reports.push(line),
            });
            expect(result.attempts).toBe(2);
            expect(result.reason).toBe('empty queue');
            expect(calls).toHaveLength(3);
            expect(disposed).toHaveLength(3);
            expect(calls.every((call) => call.model === 'Native' && call.effort === 'HIGH')).toBe(
                true,
            );
            expect(await git(root, 'show', ':nested/same')).toBe('0002');
            expect(reports.join('\n')).toContain('Iteration 2: ticket 0002 complete');
            const records = (await Deno.readTextFile(join(result.logDirectory, '0001.jsonl')))
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            expect(records).toEqual([
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    step: 'implement',
                    stream: 'stderr',
                    output: 'raw\npartial',
                },
                {
                    timestamp: '2026-01-01T00:00:01.000Z',
                    step: 'implement',
                    stream: 'stdout',
                    output: '{native event}',
                },
            ]);
            expect(reports.join('\n')).not.toContain('native event');
        });
    },
);

Deno.test(
    'Loop stops on preflight rejection, implementation failure, unclosed/dismissed/missing tickets, and abort',
    async () => {
        for (const mode of [
            'unexpected',
            'probe failure',
            'implementation failure',
            'open',
            'active',
            'missing',
            'dismissed',
            'abort',
        ]) {
            await fixture(async (root, project) => {
                const calls: RunRequest[] = [];
                const disposed: number[] = [];
                const controller = new AbortController();
                const harness = connector(
                    async (_request, index) => {
                        if (index === 1) {
                            if (mode === 'unexpected') {
                                return 'OK plus';
                            }
                            if (mode === 'probe failure') {
                                throw new Error('probe failed');
                            }
                            if (mode === 'abort') {
                                controller.abort();
                            }
                            return 'OK';
                        }
                        await Deno.writeTextFile(join(project, 'partial'), 'preserved');
                        if (mode === 'implementation failure') {
                            throw new Error('implementation failed');
                        }
                        if (mode === 'dismissed') {
                            await close(project, '0001', 'dismissed');
                        }
                        if (mode === 'missing') {
                            await Deno.remove(
                                join(project, '.coderail/tickets/open/0001-ticket.md'),
                            );
                        }
                        if (mode === 'active') {
                            const path = join(project, '.coderail/tickets/open/0001-ticket.md');
                            await Deno.writeTextFile(
                                path,
                                (await Deno.readTextFile(path)).replace(
                                    'status: open',
                                    'status: active',
                                ),
                            );
                        }
                        return 'done';
                    },
                    calls,
                    disposed,
                );
                await expect(
                    runLoop({
                        projectRoot: project,
                        connector: harness,
                        settings: {},
                        reviewSettings: {},
                        signal: controller.signal,
                        report: () => {},
                    }),
                ).rejects.toThrow();
                expect(calls.length).toBe(
                    ['unexpected', 'probe failure', 'abort'].includes(mode) ? 1 : 2,
                );
                expect(await git(root, 'diff', '--cached')).toBe('');
            });
        }
    },
);

Deno.test(
    'Loop counts limits, distinguishes blocked queues, and creates unique run logs',
    async () => {
        await fixture(async (root, project) => {
            await ticket(project, '0002', ['0002']);
            await git(root, 'add', '.');
            await git(root, 'commit', '-qm', 'blocked');
            const calls: RunRequest[] = [];
            const disposed: number[] = [];
            const harness = connector(
                async (_request, index) => {
                    if (index === 2) {
                        await close(project, '0001');
                    }
                    return 'OK';
                },
                calls,
                disposed,
            );
            const options = {
                projectRoot: project,
                connector: harness,
                settings: {},
                signal: new AbortController().signal,
                report: () => {},
            };
            const first = await runLoop({ ...options, limit: 1 });
            expect(first.reason).toBe('limit reached');
            expect(first.attempts).toBe(1);
            // A new invocation requires a clean project; simulate the user's manual commit.
            await git(root, 'commit', '-qm', 'iteration');
            const second = await runLoop(options);
            expect(second.reason).toBe('blocked queue');
            expect(second.attempts).toBe(0);
            expect(second.logDirectory).not.toBe(first.logDirectory);
            expect(first.logDirectory).toMatch(/\d{8}T\d{9}Z-[a-f0-9]+$/);
        });
    },
);

Deno.test(
    'Loop routes lifecycle output through real log levels and preserves spinners',
    async () => {
        const { Log } = await import('@log');
        const saved = {
            level: Log.level,
            nonInteractive: Log.nonInteractive,
            noColor: Log.noColor,
            spinner: Log.spinner,
            notice: Log.notice,
            info: Log.info,
            output: Log.output,
        };
        const stdout = Deno.stdout.writeSync;
        const stderr = Deno.stderr.writeSync;
        const now = performance.now;
        try {
            for (const level of ['quiet', 'normal', 'verbose'] as const) {
                for (const nonInteractive of [true, false]) {
                    await fixture(async (_root, project) => {
                        const visible: string[] = [];
                        const reports: { line: string; level: string }[] = [];
                        const methods: { line: string; level: string }[] = [];
                        let spinners = 0;
                        let disposals = 0;
                        let elapsed = 0;
                        performance.now = () => elapsed;
                        Log.level = level;
                        Log.noColor = true;
                        Log.nonInteractive = nonInteractive;
                        Deno.stdout.writeSync = Deno.stderr.writeSync = (bytes) => {
                            visible.push(new TextDecoder().decode(bytes));
                            return bytes.length;
                        };
                        for (const method of ['notice', 'info', 'output'] as const) {
                            Log[method] = (...args) => {
                                methods.push({ line: args.join(' '), level: method });
                                saved[method](...args);
                            };
                        }
                        Log.spinner = () => {
                            spinners++;
                            return {
                                setMessage: () => {},
                                addStep: () => {},
                                [Symbol.dispose]: () => {
                                    disposals++;
                                },
                            };
                        };
                        await runLoop({
                            projectRoot: project,
                            connector: connector(
                                async (request) => {
                                    if (request.prompt.startsWith('$implement')) {
                                        elapsed += 152000;
                                        await close(project, '0001');
                                    }
                                    if (request.prompt.includes('$commit')) {
                                        await git(project, 'commit', '-qm', 'iteration');
                                    }
                                    return 'OK';
                                },
                                [],
                                [],
                            ),
                            settings: { model: 'implement', effort: 'high' },
                            reviewSettings: { model: 'review' },
                            commitSettings: { model: 'commit' },
                            signal: new AbortController().signal,
                            report: (line, level) => {
                                reports.push({ line, level });
                            },
                        });
                        expect(methods).toEqual(reports);
                        expect(reports.map(({ line }) => line)).toEqual([
                            'Preflight:',
                            '  Validate implementation model=implement effort=high',
                            '  Validate review model=review effort=default',
                            '  Validate commit model=commit effort=default',
                            'Preflight complete [ ok ] · 0s',
                            'Iteration 1: ticket 0001: Ticket 0001',
                            '  Implement complete [ ok ] · 2m 32s',
                            '  Review complete [ ok ] · 0s',
                            '  Stage complete [ ok ] · 0s',
                            '  Commit complete [ ok ] · 0s',
                            'Iteration 1: ticket 0001 complete [ ok ] · 2m 32s',
                            'Loop complete [ ok ]: 1 attempt(s); empty queue; 2m 32s',
                        ]);
                        for (const { line, level } of reports) {
                            expect(level).toBe(
                                line.startsWith('Loop complete')
                                    ? 'output'
                                    : line.includes('ticket 0001 complete')
                                      ? 'info'
                                      : 'notice',
                            );
                            expect(visible.join('').includes(line)).toBe(
                                level === 'output' ||
                                    (level === 'info' && Log.level !== 'quiet') ||
                                    Log.level === 'verbose',
                            );
                        }
                        expect(visible.join('')).not.toContain('native event');
                        expect(visible.join('')).not.toContain('raw');
                        expect(spinners).toBe(nonInteractive || level === 'quiet' ? 0 : 7);
                        expect(disposals).toBe(spinners);
                    });
                }
            }
        } finally {
            Object.assign(Log, saved);
            Deno.stdout.writeSync = stdout;
            Deno.stderr.writeSync = stderr;
            performance.now = now;
        }
    },
);

Deno.test(
    'Loop disposes active runners on write failures and streaming cancellation, preserving work/index',
    async () => {
        for (const mode of [
            'write throws',
            'zero write',
            'partial write',
            'stream abort',
            'result abort',
            'result failure',
        ]) {
            await fixture(async (root, project) => {
                const originalOpen = Deno.open;
                const controller = new AbortController();
                const reports: string[] = [];
                let runs = 0;
                let disposals = 0;
                Deno.open = async (...args: Parameters<typeof Deno.open>) => {
                    const file = await originalOpen(...args);
                    if (String(args[0]).endsWith('0001.jsonl')) {
                        const write = file.write.bind(file);
                        file.write = (bytes) => {
                            if (mode === 'write throws') {
                                return Promise.reject(new Error('disk full'));
                            }
                            if (mode === 'zero write') {
                                return Promise.resolve(0);
                            }
                            return write(mode === 'partial write' ? bytes.subarray(0, 1) : bytes);
                        };
                    }
                    return file;
                };
                const harness: Pick<HarnessConnector, 'run' | 'translatePrompt'> = {
                    translatePrompt: (prompt) => prompt,
                    run: async (): Promise<Runner> => {
                        const index = ++runs;
                        if (index === 2) {
                            await Deno.writeTextFile(join(project, 'partial'), 'work');
                            await close(project, '0001');
                        }
                        return {
                            async *[Symbol.asyncIterator]() {
                                if (index === 2 && mode === 'stream abort') {
                                    controller.abort();
                                }
                                yield {
                                    timestamp: 'receipt',
                                    stream: 'stdout',
                                    output: 'chunk\n',
                                };
                            },
                            result: () => {
                                if (index === 2 && mode === 'result abort') {
                                    controller.abort();
                                }
                                if (index === 2 && mode === 'result failure') {
                                    return Promise.reject('native failure');
                                }
                                return Promise.resolve({ finalMessage: 'OK' });
                            },
                            [Symbol.asyncDispose]: async () => {
                                await Promise.resolve();
                                disposals++;
                            },
                        };
                    },
                };
                try {
                    const promise = runLoop({
                        projectRoot: project,
                        connector: harness,
                        settings: {},
                        signal: controller.signal,
                        report: (line) => reports.push(line),
                    });
                    if (mode === 'partial write') {
                        expect((await promise).attempts).toBe(1);
                    } else {
                        await expect(promise).rejects.toBeDefined();
                        expect(await git(root, 'diff', '--cached')).toBe('');
                        expect(reports.at(-1)).toContain('unfinished ticket 0001');
                        expect(reports.join('\n')).not.toContain('Staging');
                    }
                    expect(runs).toBe(2);
                    expect(disposals).toBe(2);
                    expect(await Deno.readTextFile(join(project, 'partial'))).toBe('work');
                } finally {
                    Deno.open = originalOpen;
                }
            });
        }
    },
);

Deno.test('Loop never advances after staging failure or cancellation between stages', async () => {
    for (const mode of [
        'git failure',
        'abort after implementation',
        'abort before preflight',
        'abort after preflight',
    ]) {
        await fixture(async (root, project) => {
            const controller = new AbortController();
            const calls: RunRequest[] = [];
            const reports: string[] = [];
            if (mode === 'abort before preflight') {
                controller.abort();
            }
            const harness = connector(
                async (_request, index) => {
                    if (index === 2) {
                        await close(project, '0001');
                        if (mode === 'git failure') {
                            await Deno.writeTextFile(join(root, '.git/index.lock'), 'lock');
                        }
                    }
                    return 'OK';
                },
                calls,
                [],
            );
            await expect(
                runLoop({
                    projectRoot: project,
                    connector: harness,
                    settings: {},
                    signal: controller.signal,
                    report: (line) => {
                        reports.push(line);
                        if (
                            mode === 'abort after implementation' &&
                            line.includes('Implement complete [ ok ]')
                        ) {
                            controller.abort();
                        }
                        if (
                            mode === 'abort after preflight' &&
                            line.startsWith('Preflight') &&
                            line.includes('[ ok ]')
                        ) {
                            controller.abort();
                        }
                    },
                }),
            ).rejects.toThrow();
            expect(calls.length).toBe(
                mode === 'abort before preflight' ? 0 : mode === 'abort after preflight' ? 1 : 2,
            );
            expect(await git(root, 'diff', '--cached')).toBe('');
            expect(reports.at(-1)).toContain('Loop complete [ fail ]');
        });
    }
});

Deno.test(
    'Loop stops before execution on log creation failure and reports queue read failures',
    async () => {
        for (const mode of ['mkdir', 'open', 'queue']) {
            await fixture(async (root, project) => {
                if (mode === 'queue') {
                    await Deno.remove(join(project, '.coderail/tickets/open/0001-ticket.md'));
                    await git(root, 'add', '.');
                    await git(root, 'commit', '-qm', 'empty');
                }
                const originalMkdir = Deno.mkdir;
                const originalOpen = Deno.open;
                const originalReadDir = Deno.readDir;
                const calls: RunRequest[] = [];
                if (mode === 'mkdir') {
                    Deno.mkdir = () => Promise.reject(new Error('mkdir denied'));
                }
                if (mode === 'open') {
                    Deno.open = () => Promise.reject(new Error('open denied'));
                }
                if (mode === 'queue') {
                    Deno.readDir = (path) => {
                        if (String(path).endsWith('active')) {
                            throw new Error('queue denied');
                        }
                        return originalReadDir(path);
                    };
                }
                const harness = connector(
                    async (_request, index) => {
                        if (index === 2) {
                            await close(project, '0001');
                        }
                        return 'OK';
                    },
                    calls,
                    [],
                );
                try {
                    await expect(
                        runLoop({
                            projectRoot: project,
                            connector: harness,
                            settings: {},
                            signal: new AbortController().signal,
                            report: () => {},
                        }),
                    ).rejects.toThrow(`${mode} denied`);
                    expect(calls.length).toBe(mode === 'queue' ? 1 : 0);
                } finally {
                    Deno.mkdir = originalMkdir;
                    Deno.open = originalOpen;
                    Deno.readDir = originalReadDir;
                }
            });
        }
    },
);

Deno.test(
    'Loop appends repeated ticket attempts without an implicit cap and accepts duplicate closure',
    async () => {
        await fixture(async (_root, project) => {
            const calls: RunRequest[] = [];
            const harness = connector(
                async (_request, index) => {
                    if (index > 1) {
                        await close(project, '0001', 'duplicate\nduplicate-of: "0002"');
                    }
                    return 'OK';
                },
                calls,
                [],
            );
            let completed = 0;
            const result = await runLoop({
                projectRoot: project,
                connector: harness,
                settings: {},
                signal: new AbortController().signal,
                report: (line) => {
                    if (line.startsWith('Iteration') && line.includes('complete')) {
                        completed++;
                        if (completed < 4) {
                            // Emulate a later stage reopening the ticket between iterations.
                            const directory = join(project, '.coderail/tickets');
                            const closed = join(directory, 'closed/0001-ticket.md');
                            const content = Deno.readTextFileSync(closed)
                                .replace('status: closed', 'status: open')
                                .replace(/^reason:.*\n|^duplicate-of:.*\n/gm, '');
                            Deno.writeTextFileSync(join(directory, 'open/0001-ticket.md'), content);
                            Deno.removeSync(closed);
                        }
                    }
                },
            });
            expect(result.attempts).toBe(4);
            expect(calls).toHaveLength(5);
            const records = (await Deno.readTextFile(join(result.logDirectory, '0001.jsonl')))
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            expect(records).toHaveLength(8);
            expect(records.every((record) => record.step === 'implement')).toBe(true);
            const preflight = (
                await Deno.readTextFile(join(result.logDirectory, 'preflight.jsonl'))
            )
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line));
            expect(preflight).toHaveLength(2);
            expect(preflight.every((record) => record.step === 'preflight')).toBe(true);
        });
    },
);

async function reopen(project: string): Promise<void> {
    const directory = join(project, '.coderail/tickets');
    const path = join(directory, 'closed/0001-ticket.md');
    const content =
        (await Deno.readTextFile(path)).replace('status: closed\nreason: done', 'status: open') +
        '\n1. [ ] Fix the urgent finding and verify the result.\n';
    await Deno.writeTextFile(join(directory, 'open/0001-ticket.md'), content);
    await Deno.remove(path);
}

Deno.test('Loop probes distinct enabled review settings before any implementation', async () => {
    for (const mode of ['same', 'distinct', 'effort', 'invalid', 'disabled']) {
        await fixture(async (_root, project) => {
            const calls: RunRequest[] = [];
            const reports: string[] = [];
            const harness = connector(
                async (request) => {
                    if (request.prompt === preflightPrompt) {
                        if (mode === 'invalid' && request.model === 'review') {
                            throw new Error('invalid review settings');
                        }
                    } else if (request.prompt.startsWith('$implement')) {
                        await close(project, '0001');
                    }
                    return 'OK';
                },
                calls,
                [],
            );
            const promise = runLoop({
                projectRoot: project,
                connector: harness,
                settings: { model: 'implement', effort: 'native' },
                reviewSettings:
                    mode === 'disabled'
                        ? undefined
                        : {
                              model: ['same', 'effort'].includes(mode) ? 'implement' : 'review',
                              effort: mode === 'effort' ? 'other' : 'native',
                          },
                signal: new AbortController().signal,
                report: (line) => reports.push(line),
            });
            if (mode === 'invalid') {
                await expect(promise).rejects.toThrow('invalid review settings');
                expect(reports.filter((line) => line.startsWith('Preflight complete'))).toEqual([
                    expect.stringContaining('Preflight complete [ fail ]'),
                ]);
                expect(reports.join('\n')).toContain('invalid review settings');
                expect(reports.at(-1)).toContain('0 attempt(s); invalid review settings');
                expect(calls).toHaveLength(2);
                expect(calls.every((call) => call.prompt === preflightPrompt)).toBe(true);
            } else {
                await promise;
                expect(reports.filter((line) => line.startsWith('Preflight complete'))).toEqual([
                    expect.stringContaining('Preflight complete [ ok ]'),
                ]);
                const probes = ['distinct', 'effort'].includes(mode) ? 2 : 1;
                expect(
                    calls.slice(0, probes).every((call) => call.prompt === preflightPrompt),
                ).toBe(true);
                expect(calls[probes]?.prompt).toContain('$implement');
                expect(calls).toHaveLength(probes + (mode === 'disabled' ? 1 : 2));
                if (mode !== 'disabled') {
                    expect(calls.at(-1)?.model).toBe(
                        ['same', 'effort'].includes(mode) ? 'implement' : 'review',
                    );
                    expect(calls.at(-1)?.effort).toBe(mode === 'effort' ? 'other' : 'native');
                    expect(reports.join('\n')).toContain('  Review complete [ ok ]');
                }
            }
        });
    }
});

Deno.test(
    'Review records clean, urgent, and deferred outcomes before staging and normal reselection',
    async () => {
        for (const outcome of ['clean', 'urgent', 'deferred', 'limit']) {
            await fixture(async (root, project) => {
                await ticket(project, '0000', ['0001']);
                await Deno.writeTextFile(join(project, 'shared'), 'baseline');
                await git(root, 'add', '.');
                await git(root, 'commit', '-qm', 'dependent');
                await Deno.writeTextFile(join(root, 'outside'), 'outside staged');
                await git(root, 'add', 'outside');
                const calls: RunRequest[] = [];
                const selected: string[] = [];
                let reviews = 0;
                const harness = connector(
                    async (request) => {
                        if (request.prompt === preflightPrompt) {
                            return 'OK';
                        }
                        if (request.prompt.startsWith('$implement')) {
                            const id =
                                /000\d-ticket.md/.exec(request.prompt)?.[0].slice(0, 4) ?? '';
                            selected.push(id);
                            await close(project, id);
                            await Deno.writeTextFile(
                                join(project, 'shared'),
                                `attempt ${selected.length}`,
                            );
                            await Deno.writeTextFile(join(project, 'new file'), 'new');
                        } else {
                            reviews++;
                            expect(request.cwd).toBe(project);
                            expect(request.prompt).toContain('<review-instructions>');
                            expect(request.prompt).toContain(
                                'Review only unstaged and untracked changes',
                            );
                            expect(request.prompt).toContain(
                                'Inspect unstaged changes with `git diff`',
                            );
                            expect(request.prompt).toContain(
                                'Do not modify implementation files, stage changes, or create commits',
                            );
                            expect(request.prompt).toContain('Selected ticket context:');
                            expect(request.prompt).toContain('"status":"closed"');
                            expect(await git(root, 'show', ':outside')).toBe('outside staged');
                            expect(await git(project, 'show', ':nested/shared')).toBe(
                                reviews === 1 ? 'baseline' : `attempt ${selected.length - 1}`,
                            );
                            expect(await git(project, 'diff', '--', 'shared')).toContain(
                                `+attempt ${selected.length}`,
                            );
                            if (reviews === 1) {
                                expect(
                                    await git(
                                        project,
                                        'ls-files',
                                        '--others',
                                        '--exclude-standard',
                                    ),
                                ).toContain('new file');
                                if (outcome === 'limit') {
                                    await reopen(project);
                                }
                                if (outcome === 'deferred') {
                                    await ticket(project, '0003', ['0001']);
                                }
                            }
                            if (outcome === 'urgent' && reviews <= 4) {
                                await reopen(project);
                            }
                        }
                        return 'Findings recorded; no structured response required.';
                    },
                    calls,
                    [],
                );
                const result = await runLoop({
                    projectRoot: project,
                    connector: harness,
                    settings: {},
                    reviewSettings: {},
                    signal: new AbortController().signal,
                    limit: outcome === 'limit' ? 1 : undefined,
                    report: () => {},
                });
                expect(selected).toEqual(
                    outcome === 'limit'
                        ? ['0001']
                        : outcome === 'urgent'
                          ? [...Array<string>(5).fill('0001'), '0000']
                          : outcome === 'deferred'
                            ? ['0001', '0000', '0003']
                            : ['0001', '0000'],
                );
                expect(result.attempts).toBe(selected.length);
                expect(reviews).toBe(selected.length);
                expect(result.reason).toBe(outcome === 'limit' ? 'limit reached' : 'empty queue');
                expect(await git(project, 'diff')).toBe('');
                if (outcome === 'limit') {
                    expect(
                        await git(project, 'show', ':nested/.coderail/tickets/open/0001-ticket.md'),
                    ).toContain('urgent finding');
                }
                const records = (await Deno.readTextFile(join(result.logDirectory, '0001.jsonl')))
                    .trim()
                    .split('\n')
                    .map((line) => JSON.parse(line));
                expect(records.map((record) => record.step)).toEqual(
                    Array.from({ length: outcome === 'urgent' ? 5 : 1 }, () => [
                        'implement',
                        'implement',
                        'review',
                        'review',
                    ]).flat(),
                );
                expect(calls.every((call) => !('conversation' in call))).toBe(true);
            });
        }
    },
);

Deno.test(
    'Failed review, invalid state, log failure, and cancellation preserve work before staging',
    async () => {
        for (const mode of [
            'session',
            'active',
            'dismissed',
            'missing',
            'ambiguous',
            'location',
            'follow-up',
            'log',
            'write',
            'abort',
            'between',
        ]) {
            await fixture(async (root, project) => {
                const controller = new AbortController();
                const calls: RunRequest[] = [];
                const disposed: number[] = [];
                const reports: string[] = [];
                const originalOpen = Deno.open;
                const harness = connector(
                    async (request) => {
                        if (request.prompt === preflightPrompt) {
                            return 'OK';
                        }
                        if (request.prompt.startsWith('$implement')) {
                            await close(project, '0001');
                            await Deno.writeTextFile(join(project, 'work'), 'preserved');
                            if (mode === 'log') {
                                Deno.open = () => Promise.reject(new Error('review log denied'));
                            }
                            if (mode === 'write') {
                                Deno.open = async (...args: Parameters<typeof Deno.open>) => {
                                    const file = await originalOpen(...args);
                                    file.write = () => Promise.reject(new Error('review log full'));
                                    return file;
                                };
                            }
                        } else {
                            const path = join(project, '.coderail/tickets/closed/0001-ticket.md');
                            if (mode === 'session') {
                                throw new Error('review failed');
                            }
                            if (mode === 'abort') {
                                controller.abort();
                            }
                            if (mode === 'missing') {
                                await Deno.remove(path);
                            }
                            if (mode === 'ambiguous') {
                                await ticket(project, '0001');
                            }
                            if (mode === 'location') {
                                await Deno.writeTextFile(
                                    path,
                                    (await Deno.readTextFile(path)).replace(
                                        'status: closed',
                                        'status: open',
                                    ),
                                );
                            }
                            if (mode === 'follow-up') {
                                await ticket(project, '0003');
                                await Deno.writeTextFile(
                                    join(project, '.coderail/tickets/open/0003-ticket.md'),
                                    'invalid ticket',
                                );
                            }
                            if (mode === 'active' || mode === 'dismissed') {
                                await Deno.writeTextFile(
                                    path,
                                    (await Deno.readTextFile(path)).replace(
                                        mode === 'active' ? 'status: closed' : 'reason: done',
                                        mode === 'active' ? 'status: active' : 'reason: dismissed',
                                    ),
                                );
                            }
                        }
                        return 'OK';
                    },
                    calls,
                    disposed,
                );
                try {
                    await expect(
                        runLoop({
                            projectRoot: project,
                            connector: harness,
                            settings: {},
                            reviewSettings: {},
                            signal: controller.signal,
                            report: (line) => {
                                reports.push(line);
                                if (
                                    mode === 'between' &&
                                    line.includes('Implement complete [ ok ]')
                                ) {
                                    controller.abort();
                                }
                            },
                        }),
                    ).rejects.toThrow();
                    expect(calls).toHaveLength(['log', 'between'].includes(mode) ? 2 : 3);
                    expect(disposed.length).toBe(calls.length - (mode === 'session' ? 1 : 0));
                    expect(await git(root, 'diff', '--cached')).toBe('');
                    expect(await Deno.readTextFile(join(project, 'work'))).toBe('preserved');
                    expect(reports.join('\n')).not.toContain('Staging');
                } finally {
                    Deno.open = originalOpen;
                }
            });
        }
    },
);

Deno.test(
    'Commit preflight checks all distinct enabled combinations before implementation',
    async () => {
        for (const mode of ['disabled', 'same', 'shared-review', 'distinct', 'invalid']) {
            await fixture(async (_root, project) => {
                const calls: RunRequest[] = [];
                const harness = connector(
                    async (request) => {
                        if (request.prompt === preflightPrompt) {
                            if (mode === 'invalid' && request.model === 'commit') {
                                throw new Error('invalid commit settings');
                            }
                        } else if (request.prompt.startsWith('$implement')) {
                            await close(project, '0001');
                        } else if (request.prompt.includes('$commit')) {
                            await git(project, 'commit', '-qm', 'iteration');
                        }
                        return 'OK';
                    },
                    calls,
                    [],
                );
                const promise = runLoop({
                    projectRoot: project,
                    connector: harness,
                    settings: { model: 'implement' },
                    reviewSettings: { model: mode === 'same' ? 'implement' : 'review' },
                    commitSettings:
                        mode === 'disabled'
                            ? undefined
                            : {
                                  model:
                                      mode === 'same'
                                          ? 'implement'
                                          : mode === 'shared-review'
                                            ? 'review'
                                            : 'commit',
                              },
                    signal: new AbortController().signal,
                    report: () => {},
                });
                if (mode === 'invalid') {
                    await expect(promise).rejects.toThrow('invalid commit settings');
                    expect(calls).toHaveLength(3);
                    expect(calls.every((call) => call.prompt === preflightPrompt)).toBe(true);
                } else {
                    await promise;
                    const probes = mode === 'same' ? 1 : mode === 'distinct' ? 3 : 2;
                    expect(calls.filter((call) => call.prompt === preflightPrompt)).toHaveLength(
                        probes,
                    );
                    expect(calls[probes]?.prompt).toContain('$implement');
                    expect(calls.at(-1)?.model).toBe(
                        mode === 'disabled'
                            ? 'review'
                            : mode === 'same'
                              ? 'implement'
                              : mode === 'shared-review'
                                ? 'review'
                                : 'commit',
                    );
                }
            });
        }
    },
);

Deno.test(
    'Auto commit rejects outside staged work before preflight, including nested projects',
    async () => {
        for (const outside of ['outside', '.coderail/tickets/open/0002-ticket.md']) {
            await fixture(async (root, project) => {
                await Deno.mkdir(join(root, '.coderail/tickets/open'), {
                    recursive: true,
                });
                await Deno.writeTextFile(join(root, outside), 'staged outside');
                await git(root, 'add', '--', outside);
                await Deno.writeTextFile(join(root, outside), 'unstaged outside');
                const calls: RunRequest[] = [];
                await expect(
                    runLoop({
                        projectRoot: project,
                        connector: connector(() => Promise.resolve('OK'), calls, []),
                        settings: {},
                        commitSettings: {},
                        signal: new AbortController().signal,
                        report: () => {},
                    }),
                ).rejects.toThrow('staged changes outside');
                expect(calls).toHaveLength(0);
                expect(await git(root, 'show', `:${outside}`)).toBe('staged outside');
                expect(await Deno.readTextFile(join(root, outside))).toBe('unstaged outside');
            });
        }
    },
);

Deno.test(
    'Commit workflow orders stages, reselects recorded work, logs and disposes fresh sessions',
    async () => {
        for (const outcome of ['plain', 'clean', 'urgent', 'deferred', 'limit', 'split']) {
            await fixture(async (root, project) => {
                await Deno.writeTextFile(join(root, 'outside'), 'outside dirty');
                await Deno.writeTextFile(join(root, 'untracked'), 'outside untracked');
                const calls: RunRequest[] = [];
                const disposed: number[] = [];
                const reports: string[] = [];
                const stages: string[] = [];
                const selected: string[] = [];
                const before = await git(project, 'rev-parse', 'HEAD');
                let reviews = 0;
                let commits = 0;
                const signal = new AbortController().signal;
                const harness = connector(
                    async (request) => {
                        expect(request.cwd).toBe(project);
                        expect(request.signal).toBe(signal);
                        if (request.prompt === preflightPrompt) {
                            return 'OK';
                        }
                        if (request.prompt.startsWith('$implement')) {
                            stages.push('implement');
                            const id =
                                /000\d-ticket.md/.exec(request.prompt)?.[0].slice(0, 4) ?? '';
                            selected.push(id);
                            await close(project, id);
                            await Deno.writeTextFile(
                                join(project, 'work'),
                                `attempt ${selected.length}`,
                            );
                        } else if (request.prompt.startsWith('<review-context>')) {
                            stages.push('review');
                            reviews++;
                            expect(await git(project, 'diff', '--cached')).toBe('');
                            if (reviews === 1 && ['urgent', 'limit'].includes(outcome)) {
                                await reopen(project);
                            }
                            if (reviews === 1 && outcome === 'deferred') {
                                await ticket(project, '0002', ['0001']);
                            }
                        } else {
                            stages.push('commit');
                            commits++;
                            expect(request.prompt).toContain('$commit');
                            expect(request.prompt).toContain('staged scope');
                            expect(request.prompt).toContain(project);
                            expect(await git(project, 'diff', '--cached')).not.toBe('');
                            expect(await git(project, 'diff', '--', '.')).toBe('');
                            expect(await git(root, 'diff', '--cached', '--', 'outside')).toBe('');
                            if (outcome === 'split') {
                                await git(project, 'commit', '-qm', 'work', '--', 'work');
                            }
                            await git(project, 'commit', '-qm', 'iteration');
                        }
                        return 'OK';
                    },
                    calls,
                    disposed,
                );
                const result = await runLoop({
                    projectRoot: project,
                    connector: harness,
                    settings: {},
                    reviewSettings: outcome === 'plain' ? undefined : {},
                    commitSettings: {},
                    signal,
                    limit: outcome === 'limit' ? 1 : undefined,
                    report: (line) => {
                        reports.push(line);
                        if (line.includes('Stage complete [ ok ]')) {
                            stages.push('stage');
                        }
                    },
                });
                const attempts = ['urgent', 'deferred'].includes(outcome) ? 2 : 1;
                expect(result.attempts).toBe(attempts);
                expect(selected).toEqual(
                    outcome === 'deferred'
                        ? ['0001', '0002']
                        : Array<string>(attempts).fill('0001'),
                );
                expect(stages).toEqual(
                    Array.from({ length: attempts }, () =>
                        outcome === 'plain'
                            ? ['implement', 'stage', 'commit']
                            : ['implement', 'review', 'stage', 'commit'],
                    ).flat(),
                );
                expect(commits).toBe(attempts);
                expect(await git(project, 'rev-list', '--count', `HEAD`, `^${before.trim()}`)).toBe(
                    `${outcome === 'split' ? 2 : attempts}\n`,
                );
                await assertCleanProject(project);
                expect(await Deno.readTextFile(join(root, 'outside'))).toBe('outside dirty');
                expect(await Deno.readTextFile(join(root, 'untracked'))).toBe('outside untracked');
                expect(await git(root, 'show', 'HEAD:outside')).toBe('baseline');
                expect(disposed).toHaveLength(calls.length);
                expect(calls.filter((call) => call.prompt === preflightPrompt)).toHaveLength(1);
                const records = (await Deno.readTextFile(join(result.logDirectory, '0001.jsonl')))
                    .trim()
                    .split('\n')
                    .map((line) => JSON.parse(line));
                expect(records.filter((record) => record.step === 'commit')).toHaveLength(
                    outcome === 'urgent' ? 4 : 2,
                );
                expect(reports.join('\n')).toMatch(/Commit complete \[ ok \] · \d+s/);
                expect(result.reason).toBe(outcome === 'limit' ? 'limit reached' : 'empty queue');
                if (outcome === 'limit') {
                    expect(reports.at(-1)).toContain('unfinished ticket 0001');
                }
            });
        }
    },
);

Deno.test('Commit skips empty staged diffs and empty or blocked queues', async () => {
    for (const mode of ['empty', 'blocked', 'no-diff']) {
        await fixture(async (root, project) => {
            if (mode === 'empty') {
                await close(project, '0001');
            } else if (mode === 'blocked') {
                await ticket(project, '0001', ['9999']);
                await ticket(project, '9999', ['0001']);
            }
            await git(root, 'add', '.');
            await git(root, 'commit', '--allow-empty', '-qm', 'setup');
            const calls: RunRequest[] = [];
            const reports: string[] = [];
            const before = await git(root, 'rev-parse', 'HEAD');
            const result = await runLoop({
                projectRoot: project,
                connector: connector(
                    async (request) => {
                        if (request.prompt !== preflightPrompt) {
                            expect(request.prompt).toContain('$implement');
                            await close(project, '0001');
                            // Model implementation that already recorded the complete result.
                            await git(project, 'add', '.');
                            await git(project, 'commit', '-qm', 'implementation');
                        }
                        return 'OK';
                    },
                    calls,
                    [],
                ),
                settings: {},
                commitSettings: {},
                signal: new AbortController().signal,
                report: (line) => reports.push(line),
            });
            expect(calls).toHaveLength(mode === 'no-diff' ? 2 : 1);
            expect(result.reason).toBe(mode === 'blocked' ? 'blocked queue' : 'empty queue');
            if (mode !== 'no-diff') {
                expect(await git(root, 'rev-parse', 'HEAD')).toBe(before);
            } else {
                expect(reports.join('\n')).toContain('no staged changes');
            }
        });
    }
});

Deno.test('Commit failures stop without rollback, retry, or another iteration', async () => {
    for (const mode of [
        'session',
        'result',
        'no-commit',
        'leftover',
        'dirty',
        'untracked',
        'git',
        'log',
        'write',
        'abort',
        'between',
        'stage',
        'review',
    ]) {
        await fixture(async (root, project) => {
            const controller = new AbortController();
            const calls: RunRequest[] = [];
            const disposed: number[] = [];
            const reports: string[] = [];
            const originalOpen = Deno.open;
            const before = await git(root, 'rev-parse', 'HEAD');
            await ticket(project, '0002');
            await git(project, 'add', '.');
            await git(project, 'commit', '-qm', 'second ticket');
            let commitStarted = false;
            const fake = connector(
                async (request) => {
                    if (request.prompt === preflightPrompt) {
                        return 'OK';
                    }
                    if (request.prompt.startsWith('$implement')) {
                        await close(project, '0001');
                        await Deno.writeTextFile(join(project, 'work'), 'preserved');
                        if (mode === 'stage') {
                            await Deno.writeTextFile(join(root, '.git/index.lock'), 'locked');
                        }
                    } else if (request.prompt.startsWith('<review-context>')) {
                        throw new Error('review failed');
                    } else {
                        commitStarted = true;
                        if (mode === 'session') {
                            throw new Error('commit session failed');
                        }
                        if (mode === 'git') {
                            await git(project, 'commit', '--invalid-option');
                        }
                        if (mode === 'abort') {
                            controller.abort();
                        }
                        if (['leftover', 'dirty', 'untracked', 'write', 'result'].includes(mode)) {
                            if (mode === 'leftover') {
                                await git(project, 'commit', '-qm', 'partial', '--', 'work');
                            } else {
                                await git(project, 'commit', '-qm', 'iteration');
                            }
                        }
                        if (mode === 'dirty') {
                            await Deno.writeTextFile(join(project, 'work'), 'dirty');
                        }
                        if (mode === 'untracked') {
                            await Deno.writeTextFile(join(project, 'new'), 'untracked');
                        }
                    }
                    return 'OK';
                },
                calls,
                disposed,
            );
            const harness: Pick<HarnessConnector, 'run' | 'translatePrompt'> = {
                translatePrompt: (prompt) => fake.translatePrompt(prompt),
                run: async (request) => {
                    const runner = await fake.run(request);
                    if (mode === 'result' && request.prompt.includes('$commit')) {
                        runner.result = () => Promise.reject(new Error('failed completion'));
                    }
                    return runner;
                },
            };
            try {
                await expect(
                    runLoop({
                        projectRoot: project,
                        connector: harness,
                        settings: {},
                        reviewSettings: mode === 'review' ? {} : undefined,
                        commitSettings: {},
                        signal: controller.signal,
                        report: (line) => {
                            reports.push(line);
                            if (line.includes('Stage complete [ ok ]')) {
                                if (mode === 'between') {
                                    controller.abort();
                                }
                                if (mode === 'log') {
                                    Deno.open = () =>
                                        Promise.reject(new Error('commit log denied'));
                                }
                                if (mode === 'write') {
                                    Deno.open = async (...args: Parameters<typeof Deno.open>) => {
                                        const file = await originalOpen(...args);
                                        file.write = () =>
                                            Promise.reject(new Error('commit log full'));
                                        return file;
                                    };
                                }
                            }
                        },
                    }),
                ).rejects.toThrow();
                expect(commitStarted).toBe(!['log', 'between', 'stage', 'review'].includes(mode));
                expect(calls.filter((call) => call.prompt.startsWith('$implement'))).toHaveLength(
                    1,
                );
                expect(disposed).toHaveLength(
                    calls.length - (['session', 'git', 'review'].includes(mode) ? 1 : 0),
                );
                expect(reports.at(-2)).toContain('Iteration 1: ticket 0001 complete [ fail ]');
                const failedStep =
                    mode === 'review' ? 'Review' : mode === 'stage' ? 'Stage' : 'Commit';
                expect(reports.join('\n')).toContain(`  ${failedStep} complete [ fail ]`);
                expect(reports.at(-1)).toContain('Loop complete [ fail ]: 1 attempt(s)');
                expect(reports.at(-1)).toContain('unfinished ticket 0001');
                expect(await Deno.readTextFile(join(project, 'work'))).toBe(
                    mode === 'dirty' ? 'dirty' : 'preserved',
                );
                if (['leftover', 'dirty', 'untracked', 'write', 'result'].includes(mode)) {
                    expect(
                        await git(root, 'rev-list', '--count', 'HEAD', `^${before.trim()}`),
                    ).toBe('2\n');
                }
                if (
                    ['no-commit', 'session', 'git', 'log', 'abort', 'between', 'leftover'].includes(
                        mode,
                    )
                ) {
                    expect(await git(project, 'diff', '--cached')).not.toBe('');
                }
            } finally {
                Deno.open = originalOpen;
            }
        });
    }
});

Deno.test('Loop command completes --limit 1 -rc before reporting a reopened ticket', async () => {
    const { Loop } = await import('../../../src/commands/loop.ts');
    const { Harness } = await import('@harness');
    const { Log } = await import('@log');
    await fixture(async (_root, project) => {
        const originalGet = Harness.get;
        const originalOutput = Log.output;
        const calls: RunRequest[] = [];
        const disposed: number[] = [];
        const reports: string[] = [];
        let connectorDisposed = false;
        const fake = connector(
            async (request) => {
                if (request.prompt.startsWith('$implement')) {
                    await close(project, '0001');
                }
                if (request.prompt.startsWith('<review-context>')) {
                    await reopen(project);
                }
                if (request.prompt.includes('$commit')) {
                    expect(request.model).toBe('commit-native');
                    await git(project, 'commit', '-qm', 'reviewed iteration');
                }
                return 'OK';
            },
            calls,
            disposed,
        );
        try {
            Harness.get = () => ({
                ...fake,
                name: 'codex',
                home: project,
                translateSkill: () => Promise.resolve([]),
                translateGlobalInstructions: () => Promise.resolve([]),
                translateSubagent: () => Promise.resolve([]),
                [Symbol.dispose]: () => {
                    connectorDisposed = true;
                },
            });
            Log.output = (...args) => {
                reports.push(args.join(' '));
            };
            const command = new Loop();
            await command.run({
                context: {
                    currentWorkingDirectory: join(project, 'subfolder'),
                    repositoryRoot: project,
                    installRoot: project,
                },
                configuration: {
                    defaultHarness: 'codex',
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                parsedArguments: command.parseArguments([
                    '--limit',
                    '1',
                    '-rc',
                    '-o',
                    'commit-model=commit-native',
                ]),
                signal: new AbortController().signal,
            });
            expect(calls).toHaveLength(5);
            expect(disposed).toHaveLength(5);
            expect(connectorDisposed).toBe(true);
            await assertCleanProject(project);
            expect(
                await Deno.readTextFile(join(project, '.coderail/tickets/open/0001-ticket.md')),
            ).toContain('urgent finding');
            expect(reports.at(-1)).toContain('Loop complete [ ok ]: 1 attempt(s); limit reached');
            expect(reports.at(-1)).toContain('unfinished ticket 0001');
        } finally {
            Harness.get = originalGet;
            Log.output = originalOutput;
        }
    });
});

Deno.test('Loop failure visibility retains detailed context at every log level', async () => {
    const { Log } = await import('@log');
    const saved = { level: Log.level, nonInteractive: Log.nonInteractive, noColor: Log.noColor };
    const stdout = Deno.stdout.writeSync;
    const stderr = Deno.stderr.writeSync;
    try {
        for (const level of ['quiet', 'normal', 'verbose'] as const) {
            for (const mode of [
                'preflight',
                'implement',
                'review',
                'stage',
                'commit',
                'cancel',
                'reopen',
                'skip',
            ]) {
                await fixture(async (root, project) => {
                    const visible: string[] = [];
                    const reports: { line: string; level: string }[] = [];
                    const controller = new AbortController();
                    Log.level = level;
                    Log.nonInteractive = true;
                    Log.noColor = true;
                    Deno.stdout.writeSync = Deno.stderr.writeSync = (bytes) => {
                        visible.push(new TextDecoder().decode(bytes));
                        return bytes.length;
                    };
                    const promise = runLoop({
                        projectRoot: project,
                        connector: connector(
                            async (request) => {
                                const stage =
                                    request.prompt === preflightPrompt
                                        ? 'preflight'
                                        : request.prompt.startsWith('$implement')
                                          ? 'implement'
                                          : request.prompt.startsWith('<review-context>')
                                            ? 'review'
                                            : 'commit';
                                if (stage === mode) {
                                    throw new Error(`${stage} denied`);
                                }
                                if (stage === 'implement') {
                                    await close(project, '0001');
                                    if (mode === 'stage') {
                                        await Deno.writeTextFile(
                                            join(root, '.git/index.lock'),
                                            'locked',
                                        );
                                    }
                                    if (mode === 'skip') {
                                        await git(project, 'add', '.');
                                        await git(project, 'commit', '-qm', 'implementation');
                                    }
                                }
                                if (stage === 'review') {
                                    if (mode === 'cancel') {
                                        controller.abort();
                                    }
                                    if (mode === 'reopen') {
                                        await reopen(project);
                                    }
                                }
                                if (stage === 'commit') {
                                    await git(project, 'commit', '-qm', 'iteration');
                                }
                                return 'OK';
                            },
                            [],
                            [],
                        ),
                        settings: {},
                        reviewSettings: {},
                        commitSettings: {},
                        limit: 1,
                        signal: controller.signal,
                        report: (line, level) => {
                            reports.push({ line, level });
                        },
                    });
                    const failed = !['reopen', 'skip'].includes(mode);
                    if (failed) {
                        await expect(promise).rejects.toThrow();
                    } else {
                        await promise;
                    }
                    const preflight = reports.filter(({ line }) =>
                        line.startsWith('Preflight complete'),
                    );
                    expect(preflight).toHaveLength(1);
                    expect(preflight[0]?.line).toContain(
                        mode === 'preflight' ? '[ fail ]' : '[ ok ]',
                    );
                    const iteration = reports.filter(({ level }) => level === 'info');
                    expect(iteration).toHaveLength(mode === 'preflight' ? 0 : 1);
                    if (mode !== 'preflight') {
                        expect(iteration[0]?.line).toContain(
                            `Iteration 1: ticket 0001 complete [ ${failed ? 'fail' : 'ok'} ]`,
                        );
                    }
                    const final = reports.at(-1);
                    expect(final?.line).toContain(
                        `Loop complete [ ${failed ? 'fail' : 'ok'} ]: ${mode === 'preflight' ? 0 : 1} attempt(s)`,
                    );
                    if (failed) {
                        const detail =
                            mode === 'stage'
                                ? 'index.lock'
                                : mode === 'cancel'
                                  ? 'cancelled'
                                  : `${mode} denied`;
                        expect(final?.line).toContain(detail);
                        const step =
                            mode === 'cancel' ? 'Review' : mode[0]?.toUpperCase() + mode.slice(1);
                        expect(
                            reports.some(
                                ({ line }) =>
                                    line.includes(`${step} complete [ fail ]`) &&
                                    line.includes(detail),
                            ),
                        ).toBe(true);
                    } else {
                        expect(final?.line).toContain('limit reached');
                    }
                    if (!['preflight', 'skip'].includes(mode)) {
                        expect(final?.line).toContain('unfinished ticket 0001 Ticket 0001');
                    }
                    if (mode === 'skip') {
                        expect(reports).toContainEqual({
                            line: '  Commit skipped: no staged changes.',
                            level: 'notice',
                        });
                    }
                    for (const { line, level: category } of reports) {
                        expect(category).toBe(
                            line.startsWith('Loop complete')
                                ? 'output'
                                : line.startsWith('Iteration') && line.includes('complete')
                                  ? 'info'
                                  : 'notice',
                        );
                        expect(visible.join('').includes(line)).toBe(
                            category === 'output' ||
                                (category === 'info' && level !== 'quiet') ||
                                level === 'verbose',
                        );
                    }
                });
            }
        }
    } finally {
        Object.assign(Log, saved);
        Deno.stdout.writeSync = stdout;
        Deno.stderr.writeSync = stderr;
    }
});
