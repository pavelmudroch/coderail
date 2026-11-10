/** A fresh session; omitted native settings are inherited from the CLI configuration. */
export interface RunRequest {
    cwd: string;
    prompt: string;
    model?: string;
    effort?: string;
    signal?: AbortSignal;
}

export type Message = {
    timestamp: string;
    stream: 'stdout' | 'stderr';
    output: string;
};

/** Streams raw text once. result() also works without consuming the iterator. */
export interface Runner extends AsyncDisposable, AsyncIterable<Message> {
    result(): Promise<{ finalMessage: string }>;
}

/** Internal shared process lifecycle; native protocol interpretation stays in each connector. */
export function startRunner(
    command: string,
    args: string[],
    request: RunRequest,
    observe: (event: Record<string, unknown>) => void,
    finalMessage: () => string,
): Runner {
    request.signal?.throwIfAborted();
    const child = new Deno.Command(command, {
        args,
        cwd: request.cwd,
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
        // Keep tool descendants in a session-owned process group, even after parent exit.
        detached: true,
    }).spawn();
    const queue: Message[] = [];
    let wake: (() => void) | undefined;
    let done = false;
    let cancelled = false;
    const status = child.status.then((status) => {
        if (!status.success && !cancelled) {
            throw new Error(`${command} exited with code ${status.code}.`);
        }
        return status;
    });
    const stop = (): void => {
        if (!done && !cancelled) {
            cancelled = true;
            try {
                Deno.kill(-child.pid, 'SIGKILL');
            } catch (error) {
                // The whole group may already have exited by the time cleanup runs.
                if (!(error instanceof Deno.errors.NotFound)) {
                    throw error;
                }
            }
        }
    };
    const publish = (stream: Message['stream'], output: string): void => {
        if (output) {
            queue.push({ timestamp: new Date().toISOString(), stream, output });
            wake?.();
        }
    };
    const parse = (line: string): void => {
        let event: unknown;
        try {
            event = JSON.parse(line);
        } catch {
            return;
        }
        if (event !== null && typeof event === 'object' && !Array.isArray(event)) {
            observe(event as Record<string, unknown>);
        }
    };
    const drain = async (
        stream: Message['stream'],
        readable: ReadableStream<Uint8Array>,
    ): Promise<void> => {
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        let pending = '';
        const receive = (output: string): void => {
            publish(stream, output);
            if (stream === 'stdout') {
                pending += output;
                let newline: number;
                while ((newline = pending.indexOf('\n')) !== -1) {
                    parse(pending.slice(0, newline));
                    pending = pending.slice(newline + 1);
                }
            }
        };
        for await (const bytes of readable) {
            receive(decoder.decode(bytes, { stream: true }));
        }
        receive(decoder.decode());
        if (stream === 'stdout' && pending) {
            parse(pending);
        }
    };
    const write = async (): Promise<void> => {
        const writer = child.stdin.getWriter();
        try {
            await writer.write(new TextEncoder().encode(request.prompt));
            await writer.close();
        } finally {
            writer.releaseLock();
        }
    };
    request.signal?.addEventListener('abort', stop, { once: true });
    const tasks = [
        drain('stdout', child.stdout),
        drain('stderr', child.stderr),
        write(),
        status,
    ] as const;
    const completion = (async (): Promise<{ finalMessage: string }> => {
        try {
            await Promise.all(tasks);
            if (cancelled) {
                throw new Error(`${command} execution cancelled.`);
            }
            return { finalMessage: finalMessage() };
        } catch (error) {
            stop();
            await Promise.allSettled(tasks);
            throw error;
        } finally {
            done = true;
            request.signal?.removeEventListener('abort', stop);
            wake?.();
        }
    })();
    // A caller may consume the stream or dispose before ever requesting the result.
    void completion.catch(() => {});
    const dispose = async (): Promise<void> => {
        stop();
        await completion.catch(() => {});
    };
    return {
        result: () => completion,
        async *[Symbol.asyncIterator]() {
            try {
                while (true) {
                    const message = queue.shift();
                    if (message) {
                        yield message;
                    } else if (done) {
                        break;
                    } else {
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                        });
                    }
                }
                await completion;
            } finally {
                await dispose();
            }
        },
        [Symbol.asyncDispose]: dispose,
    };
}
