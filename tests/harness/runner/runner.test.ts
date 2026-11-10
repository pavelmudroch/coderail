import { expect } from '@std/expect';

import { startRunner } from '../../../src/harness/runner/runner.ts';

async function bounded<T>(promise: PromiseLike<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Runner cleanup timed out')), 5000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function terminated(pid: number): Promise<boolean> {
    const status = await new Deno.Command('ps', {
        args: ['-o', 'stat=', '-p', String(pid)],
    }).output();
    // Orphaned descendants may remain zombies until the host's init reaps them.
    return !status.success || new TextDecoder().decode(status.stdout).trim().startsWith('Z');
}

for (const mode of [
    'abort',
    'dispose',
    'break',
    'consumer failure',
    'protocol failure',
    'parent failure',
    'abort after parent exit',
    'dispose after parent exit',
] as const) {
    Deno.test(`Runner stops the process tree on ${mode}`, async () => {
        const root = await Deno.makeTempDir();
        const readyFile = `${root}/ready`;
        const ready = Promise.withResolvers<{ parent: number; descendant: number }>();
        const controller = new AbortController();
        const runner = startRunner(
            Deno.execPath(),
            [
                'eval',
                `
                await new Response(Deno.stdin.readable).text();
                const child = new Deno.Command(Deno.execPath(), {
                    args: ['eval', ${JSON.stringify(`
                        await Deno.writeTextFile(${JSON.stringify(readyFile)}, '');
                        setInterval(() => {}, 1000);
                    `)}],
                    stdin: 'null', stdout: 'inherit', stderr: 'inherit',
                }).spawn();
                while (true) {
                    try { await Deno.stat(${JSON.stringify(readyFile)}); break; }
                    catch { await new Promise(resolve => setTimeout(resolve, 5)); }
                }
                console.log(JSON.stringify({ parent: Deno.pid, descendant: child.pid }));
                if (${JSON.stringify(mode)} === 'parent failure') Deno.exit(9);
                if (${JSON.stringify(mode)}.includes('after parent exit')) Deno.exit(0);
                setInterval(() => {}, 1000);
                `,
            ],
            { cwd: Deno.cwd(), prompt: '', signal: controller.signal },
            (event) => {
                ready.resolve(event as { parent: number; descendant: number });
                if (mode === 'protocol failure') {
                    throw new Error('original protocol failure');
                }
            },
            () => 'unreachable',
        );
        let pids: { parent: number; descendant: number } | undefined;
        try {
            const processes = await bounded(ready.promise);
            pids = processes;
            if (mode.includes('after parent exit')) {
                await bounded(
                    (async () => {
                        while (!(await terminated(processes.parent))) {
                            await new Promise((resolve) => setTimeout(resolve, 5));
                        }
                    })(),
                );
            }
            const iterator = runner[Symbol.asyncIterator]();
            if (mode !== 'consumer failure') {
                await bounded(iterator.next());
            }
            if (mode.startsWith('abort') || mode.startsWith('dispose')) {
                const pending = iterator.next();
                void pending.catch(() => {});
                if (mode.startsWith('abort')) {
                    controller.abort();
                }
                await bounded(
                    Promise.all([runner[Symbol.asyncDispose](), runner[Symbol.asyncDispose]()]),
                );
                await expect(bounded(pending)).rejects.toThrow('cancelled');
            } else if (mode === 'break') {
                await bounded(Promise.resolve(iterator.return?.()));
            } else if (mode === 'consumer failure') {
                await expect(
                    bounded(
                        (async () => {
                            await using session = runner;
                            for await (const _ of session) {
                                throw new Error('log write failed');
                            }
                        })(),
                    ),
                ).rejects.toThrow('log write failed');
            }
            const error =
                mode === 'protocol failure'
                    ? 'original protocol failure'
                    : mode === 'parent failure'
                      ? 'exited with code 9'
                      : 'cancelled';
            await expect(bounded(runner.result())).rejects.toThrow(error);
            await bounded(runner[Symbol.asyncDispose]());
            await bounded(
                (async () => {
                    while (
                        !(await terminated(processes.parent)) ||
                        !(await terminated(processes.descendant))
                    ) {
                        await new Promise((resolve) => setTimeout(resolve, 5));
                    }
                })(),
            );
        } finally {
            if (pids) {
                for (const pid of [pids.descendant, pids.parent]) {
                    try {
                        Deno.kill(pid, 'SIGKILL');
                    } catch {
                        /* already exited */
                    }
                }
            }
            await bounded(runner[Symbol.asyncDispose]());
            await Deno.remove(root, { recursive: true });
        }
    });
}

Deno.test('Runner surfaces unexpected process-group shutdown errors', async () => {
    const kill = Deno.kill;
    const failure = new Error('process-group shutdown failed');
    await using runner = startRunner(
        Deno.execPath(),
        ['eval', ''],
        { cwd: Deno.cwd(), prompt: '' },
        () => {},
        () => {
            // Both streams and the parent have exited, so no process can be leaked.
            Deno.kill = () => {
                throw failure;
            };
            throw new Error('missing final message');
        },
    );
    try {
        await expect(runner.result()).rejects.toBe(failure);
    } finally {
        Deno.kill = kill;
    }
});

Deno.test(
    'Runner drains large output on both streams even when only result is consumed',
    async () => {
        const text = 'ž🐈'.repeat(20000);
        const answers: unknown[] = [];
        await using runner = startRunner(
            Deno.execPath(),
            [
                'eval',
                `
        const text = 'ž🐈'.repeat(20000);
        async function write(stream, text) {
            let bytes = new TextEncoder().encode(text);
            while (bytes.length) bytes = bytes.subarray(await stream.write(bytes));
        }
        await Promise.all([
            write(Deno.stdout, JSON.stringify({ text })),
            write(Deno.stderr, text),
        ]);
    `,
            ],
            { cwd: Deno.cwd(), prompt: '' },
            (event) => {
                answers.push(event.text);
            },
            () => 'done',
        );
        expect(await runner.result()).toEqual({ finalMessage: 'done' });
        expect(answers).toEqual([text]);
        const messages = [];
        for await (const message of runner) {
            messages.push(message);
        }
        expect(
            messages
                .filter((m) => m.stream === 'stderr')
                .map((m) => m.output)
                .join(''),
        ).toBe(text);
        expect(
            messages
                .filter((m) => m.stream === 'stdout')
                .map((m) => m.output)
                .join(''),
        ).toBe(JSON.stringify({ text }));
    },
);

Deno.test('Runner stops and awaits a child when protocol observation fails', async () => {
    let pid = 0;
    await using runner = startRunner(
        Deno.execPath(),
        [
            'eval',
            `
        console.log(JSON.stringify({ pid: Deno.pid }));
        setInterval(() => {}, 1000);
    `,
        ],
        { cwd: Deno.cwd(), prompt: '' },
        (event) => {
            pid = Number(event.pid);
            throw new Error('observer failed');
        },
        () => 'unreachable',
    );
    await expect(runner.result()).rejects.toThrow('observer failed');
    expect(() => Deno.kill(pid, 'SIGCONT')).toThrow();
});

Deno.test('Runner rejects a broken stdin pipe and terminates the process', async () => {
    await using runner = startRunner(
        Deno.execPath(),
        [
            'eval',
            `
        Deno.exit(0);
    `,
        ],
        { cwd: Deno.cwd(), prompt: 'x'.repeat(1000000) },
        () => {},
        () => 'unreachable',
    );
    await expect(runner.result()).rejects.toThrow();
});

Deno.test('Runner disposal before iteration is idempotent and rejects the result', async () => {
    const runner = startRunner(
        Deno.execPath(),
        ['eval', 'setInterval(() => {}, 1000)'],
        {
            cwd: Deno.cwd(),
            prompt: '',
        },
        () => {},
        () => 'unreachable',
    );
    await runner[Symbol.asyncDispose]();
    await runner[Symbol.asyncDispose]();
    await expect(runner.result()).rejects.toThrow();
});

Deno.test(
    'Runner ignores non-object protocol data and rejects unsuccessful process completion',
    async () => {
        const events: unknown[] = [];
        await using runner = startRunner(
            Deno.execPath(),
            [
                'eval',
                `
        console.log('not json\\nnull\\n[]\\n42\\n{}');
        Deno.exit(4);
    `,
            ],
            { cwd: Deno.cwd(), prompt: '' },
            (event) => {
                events.push(event);
            },
            () => 'unreachable',
        );
        await expect(runner.result()).rejects.toThrow('exited with code 4');
        expect(events).toEqual([{}]);
    },
);

Deno.test('Runner observes aborts, wakes pending iteration, and awaits cancellation', async () => {
    const controller = new AbortController();
    let pid = 0;
    await using runner = startRunner(
        Deno.execPath(),
        [
            'eval',
            `
        console.log(JSON.stringify({ pid: Deno.pid }));
        setInterval(() => {}, 1000);
    `,
        ],
        { cwd: Deno.cwd(), prompt: '', signal: controller.signal },
        (event) => {
            pid = Number(event.pid);
        },
        () => 'unreachable',
    );
    await expect(
        (async () => {
            for await (const message of runner) {
                expect(message.stream).toBe('stdout');
                controller.abort();
            }
        })(),
    ).rejects.toThrow('cancelled');
    await expect(runner.result()).rejects.toThrow('cancelled');
    expect(() => Deno.kill(pid, 'SIGCONT')).toThrow();
    expect(() =>
        startRunner(
            Deno.execPath(),
            ['eval', ''],
            {
                cwd: Deno.cwd(),
                prompt: '',
                signal: controller.signal,
            },
            () => {},
            () => '',
        ),
    ).toThrow();
});
