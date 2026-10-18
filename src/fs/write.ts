import { basename, dirname, join } from '@std/path';
import { registerTempResource } from './temp/register-temp-resource.ts';
import { unregisterTempResource } from './temp/unregister-temp-resource.ts';

export async function write(
    filePath: string,
    content: ReadableStream<Uint8Array | string>,
): Promise<void> {
    const lockPath = join(dirname(filePath), `.~${basename(filePath)}.lock`);
    {
        using file = await Deno.open(lockPath, { write: true, createNew: true });
        registerTempResource(lockPath);
        const encoder = new TextEncoder();
        for await (const chunk of content) {
            const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
            let written = 0;
            while (written < bytes.length) {
                written += await file.write(bytes.subarray(written));
            }
        }
    }
    await Deno.rename(lockPath, filePath);
    unregisterTempResource(lockPath);
}
