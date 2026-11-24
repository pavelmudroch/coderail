import type { Command } from '@commands';
import { Fs } from '@fs';
import { Log } from '@log';
import { expect } from '@std/expect';
import { dirname, join, relative } from '@std/path';
import { resolveTicket } from '@tickets';

import { Activate } from '../../src/commands/ticket/activate.ts';
import { Close } from '../../src/commands/ticket/close.ts';
import { Reopen } from '../../src/commands/ticket/reopen.ts';
import { withTicketLock } from '../../src/tickets/with-ticket-lock.ts';

async function withWorkspace(run: (root: string) => Promise<void>): Promise<void> {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        await run(root);
    } finally {
        await Fs.cleanup();
        await Deno.remove(root, { recursive: true });
    }
}

function lockPath(root: string, id: string): string {
    return join(root, '.coderail', '.locks', 'tickets', id + '.lock');
}

async function openTicket(root: string, id: string): Promise<string> {
    const path = join(root, '.coderail', 'tickets', 'open', id + '-fixture.md');
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, '---\ntitle: Fixture\nstatus: open\n---\n\n# Fixture\n');
    return path;
}

function runCommand<T extends Record<string, unknown>>(
    command: Command<T>,
    root: string,
    args: string[],
    signal = new AbortController().signal,
): Promise<void> {
    return command.run({
        context: { currentWorkingDirectory: root, installRoot: '/install' },
        configuration: {
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: { rules: [] },
        },
        parsedArguments: command.parseArguments(args),
        signal,
    });
}

function interceptTimer(schedule: (callback: () => void, delay: number) => unknown): void {
    globalThis.setTimeout = schedule as typeof setTimeout;
}

Deno.test(
    'Ticket locks hold a normalized ID through the callback and release on failure',
    async () => {
        await withWorkspace(async (root) => {
            const path = lockPath(root, '0001');
            const signal = new AbortController().signal;
            const failure = new Error('failed under lock');
            const entered = Promise.withResolvers<void>();
            const finish = Promise.withResolvers<void>();
            const holder = withTicketLock(root, 'obsolete/0001-fixture.md', signal, async () => {
                entered.resolve();
                await finish.promise;
                throw failure;
            });
            await entered.promise;
            try {
                expect(await Deno.readTextFile(path)).toBe('');
                await expect(Fs.makeTempFile(path)).rejects.toBeInstanceOf(
                    Deno.errors.AlreadyExists,
                );
                const value = {};
                expect(
                    await withTicketLock(root, '0002', signal, () => Promise.resolve(value)),
                ).toBe(value);
                expect((await Deno.stat(path)).isFile).toBe(true);
                await expect(Deno.stat(lockPath(root, '0002'))).rejects.toBeInstanceOf(
                    Deno.errors.NotFound,
                );
            } finally {
                finish.resolve();
                await expect(holder).rejects.toBe(failure);
            }
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        });
    },
);

Deno.test(
    'Competing ticket transitions validate the winner’s state for every identifier form',
    async () => {
        await withWorkspace(async (root) => {
            const source = await openTicket(root, '0001');
            const alias = join(root, 'alias');
            await Deno.symlink(root, alias, { type: 'dir' });
            const path = lockPath(root, '0001');
            const output = Log.output;
            const makeTempFile = Fs.makeTempFile;
            const write = Fs.write;
            const setTimer = globalThis.setTimeout;
            const writing = Promise.withResolvers<void>();
            const publish = Promise.withResolvers<void>();
            let waiting = Promise.withResolvers<number>();
            Log.output = () => {};
            Fs.makeTempFile = (requested) => {
                expect(requested).toBe(path);
                return makeTempFile(requested);
            };
            Fs.write = async (target, content) => {
                if (target === join(root, '.coderail', 'tickets', 'closed', '0001-fixture.md')) {
                    writing.resolve();
                    await publish.promise;
                }
                await write(target, content);
            };
            interceptTimer((callback, delay) => {
                waiting.resolve(delay);
                return setTimer(callback, delay);
            });
            const close = runCommand(new Close(), root, ['0001', '--reason=dismissed']);
            let activate: Promise<void> | undefined;
            try {
                await Promise.race([writing.promise, close]);
                expect((await Deno.stat(path)).isFile).toBe(true);
                activate = runCommand(new Activate(), relative(Deno.cwd(), alias), [
                    '0001-fixture.md',
                ]);
                const rejected = expect(activate).rejects.toMatchObject({
                    cause: { message: 'Ticket "0001-fixture.md" is not open.' },
                });
                expect(await Promise.race([waiting.promise, rejected])).toBe(100);
                expect((await resolveTicket(root, '0001')).status).toBe('open');

                publish.resolve();
                await close;
                await rejected;
                expect(await resolveTicket(root, '0001')).toMatchObject({
                    status: 'closed',
                    reason: 'dismissed',
                });

                const lock = await Fs.makeTempFile(path);
                waiting = Promise.withResolvers<number>();
                const reopen = runCommand(new Reopen(), `${alias}/..`, [source]);
                try {
                    expect(await Promise.race([waiting.promise, reopen])).toBe(100);
                    expect((await resolveTicket(root, '0001')).status).toBe('closed');
                } finally {
                    await lock.remove();
                    await reopen;
                }
                expect(await resolveTicket(root, '0001')).toMatchObject({ status: 'open' });
                await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            } finally {
                publish.resolve();
                await Promise.allSettled([close, activate]);
                Fs.makeTempFile = makeTempFile;
                Fs.write = write;
                Log.output = output;
                globalThis.setTimeout = setTimer;
            }
        });
    },
);

Deno.test('Ticket lock times out after 30 seconds of asynchronous 100 ms retries', async () => {
    await withWorkspace(async (root) => {
        const source = await openTicket(root, '0001');
        const before = await Deno.readTextFile(source);
        const path = lockPath(root, '0001');
        await Deno.mkdir(dirname(path), { recursive: true });
        await Deno.writeTextFile(path, 'other owner');
        const now = performance.now;
        const setTimer = globalThis.setTimeout;
        const open = Deno.open;
        const delays: number[] = [];
        let attempts = 0;
        let elapsed = 0;
        performance.now = () => elapsed;
        interceptTimer((callback, delay) => {
            delays.push(delay);
            return setTimer(() => {
                elapsed += delay;
                callback();
            }, 0);
        });
        Deno.open = (target, options) => {
            if (target === path) {
                attempts++;
            }
            return open(target, options);
        };
        try {
            await expect(runCommand(new Close(), root, [source])).rejects.toMatchObject({
                cause: {
                    message: `Cannot acquire lock for ticket 0001 at ${path}`,
                    cause: { message: 'Timed out after 30000 ms' },
                },
            });
            expect(elapsed).toBe(30_000);
            expect(attempts).toBe(300);
            expect(delays).toEqual(new Array(300).fill(100));
            expect(await Deno.readTextFile(source)).toBe(before);
            await expect(
                Deno.stat(join(root, '.coderail', 'tickets', 'closed')),
            ).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect(await Deno.readTextFile(path)).toBe('other owner');
            await Fs.cleanup();
            expect(await Deno.readTextFile(path)).toBe('other owner');
        } finally {
            performance.now = now;
            globalThis.setTimeout = setTimer;
            Deno.open = open;
        }
    });
});

Deno.test('Ticket lock does not retry creation errors unrelated to contention', async () => {
    await withWorkspace(async (root) => {
        const open = Deno.open;
        const path = lockPath(root, '0001');
        const denied = new Deno.errors.PermissionDenied('lock creation denied');
        Deno.open = (target, options) =>
            target === path ? Promise.reject(denied) : open(target, options);
        const setTimer = globalThis.setTimeout;
        interceptTimer(() => {
            throw new Error('retried a non-contention error');
        });
        try {
            await expect(
                withTicketLock(root, '0001', new AbortController().signal, () => Promise.resolve()),
            ).rejects.toMatchObject({
                message: `Cannot acquire lock for ticket 0001 at ${path}`,
                cause: denied,
            });
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        } finally {
            Deno.open = open;
            globalThis.setTimeout = setTimer;
        }
    });
});

Deno.test('Ticket lock stops after a contended attempt crosses the deadline', async () => {
    await withWorkspace(async (root) => {
        const makeTempFile = Fs.makeTempFile;
        const now = performance.now;
        const path = lockPath(root, '0001');
        const setTimer = globalThis.setTimeout;
        let attempts = 0;
        Fs.makeTempFile = (target) => {
            if (target === path) {
                attempts++;
                return Promise.reject(new Deno.errors.AlreadyExists());
            }
            return makeTempFile(target);
        };
        performance.now = () => (attempts === 0 ? 0 : 30_001);
        interceptTimer(() => {
            throw new Error('retried after deadline');
        });
        try {
            await expect(
                withTicketLock(root, '0001', new AbortController().signal, () => Promise.resolve()),
            ).rejects.toMatchObject({ cause: { message: 'Timed out after 30000 ms' } });
            expect(attempts).toBe(1);
        } finally {
            Fs.makeTempFile = makeTempFile;
            performance.now = now;
            globalThis.setTimeout = setTimer;
        }
    });
});

Deno.test('Ticket lock releases a successful retry that completes after the deadline', async () => {
    await withWorkspace(async (root) => {
        const source = await openTicket(root, '0001');
        const before = await Deno.readTextFile(source);
        const path = lockPath(root, '0001');
        await Deno.mkdir(dirname(path), { recursive: true });
        await Deno.writeTextFile(path, 'other owner');
        const open = Deno.open;
        const now = performance.now;
        const setTimer = globalThis.setTimeout;
        let attempts = 0;
        let elapsed = 0;
        performance.now = () => elapsed;
        Deno.open = async (target, options) => {
            if (target !== path) {
                return open(target, options);
            }
            attempts++;
            if (attempts === 2) {
                await Deno.remove(path);
            }
            const file = await open(target, options);
            elapsed = 30_001;
            return file;
        };
        interceptTimer((callback, delay) =>
            setTimer(() => {
                elapsed += delay;
                callback();
            }, 0),
        );
        try {
            await expect(runCommand(new Close(), root, [source])).rejects.toMatchObject({
                cause: {
                    message: `Cannot acquire lock for ticket 0001 at ${path}`,
                    cause: { message: 'Timed out after 30000 ms' },
                },
            });
            expect(attempts).toBe(2);
            expect(await Deno.readTextFile(source)).toBe(before);
            await expect(
                Deno.stat(join(root, '.coderail', 'tickets', 'closed')),
            ).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        } finally {
            Deno.open = open;
            performance.now = now;
            globalThis.setTimeout = setTimer;
        }
    });
});

Deno.test(
    'Ticket lock cancellation interrupts retry and preserves the existing owner',
    async () => {
        await withWorkspace(async (root) => {
            const path = lockPath(root, '0001');
            const cancellation = new Error('cancelled');
            const neverRun = (): Promise<void> => {
                throw new Error('callback ran unexpectedly');
            };
            await expect(
                withTicketLock(root, '0001', AbortSignal.abort(cancellation), neverRun),
            ).rejects.toBe(cancellation);
            await expect(Deno.stat(dirname(path))).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await Deno.mkdir(dirname(path), { recursive: true });
            await Deno.writeTextFile(path, 'other owner');
            const setTimer = globalThis.setTimeout;
            const waiting = Promise.withResolvers<void>();
            interceptTimer((callback) => {
                waiting.resolve();
                return setTimer(callback, 30_000);
            });
            const controller = new AbortController();
            const pending = withTicketLock(root, '0001', controller.signal, neverRun);
            try {
                const rejected = expect(pending).rejects.toBe(cancellation);
                await Promise.race([waiting.promise, rejected]);
                controller.abort(cancellation);
                await rejected;
                expect(await Deno.readTextFile(path)).toBe('other owner');
            } finally {
                controller.abort(cancellation);
                globalThis.setTimeout = setTimer;
            }
        });
    },
);

Deno.test('Ticket lock releases acquisition if cancellation beats the callback', async () => {
    await withWorkspace(async (root) => {
        const controller = new AbortController();
        const cancellation = new Error('cancelled before callback');
        const path = lockPath(root, '0001');
        const makeTempFile = Fs.makeTempFile;
        Fs.makeTempFile = async (target) => {
            const lock = await makeTempFile(target);
            controller.abort(cancellation);
            return lock;
        };
        try {
            await expect(
                withTicketLock(root, '0001', controller.signal, () => Promise.resolve()),
            ).rejects.toBe(cancellation);
            await expect(Deno.stat(path)).rejects.toBeInstanceOf(Deno.errors.NotFound);
        } finally {
            Fs.makeTempFile = makeTempFile;
        }
    });
});
