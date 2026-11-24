import { Fs, type TempFile } from '@fs';
import { Path } from '@path';
import { dirname, join, resolve } from '@std/path';

import { extractId } from './resolve-ticket.ts';

const RETRY_INTERVAL_MS = 100;
const ACQUISITION_TIMEOUT_MS = 30_000;

export async function withTicketLock<T>(
    projectRoot: string,
    identifier: string,
    signal: AbortSignal,
    run: () => Promise<T>,
): Promise<T> {
    signal.throwIfAborted();
    const id = extractId(identifier);
    const root = await Deno.realPath(resolve(projectRoot));
    const path = join(root, Path.CODERAIL_DIR, '.locks', Path.TICKETS_DIR, `${id}.lock`);
    return withOperationLock(path, `ticket ${id}`, signal, run);
}

export async function withOperationLock<T>(
    path: string,
    description: string,
    signal: AbortSignal,
    run: () => Promise<T>,
): Promise<T> {
    const lock = await acquireLock(path, description, signal);
    try {
        signal.throwIfAborted();
        return await run();
    } finally {
        await lock.remove();
    }
}

async function acquireLock(
    path: string,
    description: string,
    signal: AbortSignal,
): Promise<TempFile> {
    try {
        await Fs.makeDirectory(dirname(path));
        const deadline = performance.now() + ACQUISITION_TIMEOUT_MS;
        do {
            signal.throwIfAborted();
            let lock: TempFile | undefined;
            try {
                lock = await Fs.makeTempFile(path);
            } catch (error) {
                if (!(error instanceof Deno.errors.AlreadyExists)) {
                    throw error;
                }
            }
            const remaining = deadline - performance.now();
            if (remaining <= 0) {
                await lock?.remove();
                break;
            }
            if (lock !== undefined) {
                return lock;
            }
            await waitForRetry(Math.min(RETRY_INTERVAL_MS, remaining), signal);
        } while (performance.now() < deadline);
        throw new Error(`Timed out after ${ACQUISITION_TIMEOUT_MS} ms`);
    } catch (error) {
        signal.throwIfAborted();
        throw new Error(`Cannot acquire lock for ${description} at ${path}`, { cause: error });
    }
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const retry = Promise.withResolvers<void>();
    const timer = setTimeout(retry.resolve, delay);
    const abort = (): void => {
        clearTimeout(timer);
        retry.reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    return retry.promise.finally(() => signal.removeEventListener('abort', abort));
}
