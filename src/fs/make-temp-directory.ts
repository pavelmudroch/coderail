import { dirname, join } from '@std/path';
import { registerTempResource } from './temp/register-temp-resource.ts';

export interface TempDirectory {
    /** Path of the temporary directory. */
    readonly path: string;
    /**
     * Add a new directory to the temporary directory, creates parent directories if necessary.
     * @param path Path of the directory to add.
     * @returns The path of the newly added directory.
     */
    addDirectory(path: string): Promise<string>;
    /**
     * Add a new file to the temporary directory, creates parent directories if necessary.
     * @param path Path of the file to add.
     * @param content Content of the file.
     * @returns The path of the newly added file.
     */
    addFile(path: string, content: ReadableStream<Uint8Array | string>): Promise<string>;
}

export async function makeTempDirectory(): Promise<TempDirectory> {
    const tempDir = await Deno.makeTempDir({ prefix: 'coderail_' });
    registerTempResource(tempDir);

    return {
        path: tempDir,
        async addDirectory(path: string): Promise<string> {
            const fullPath = join(tempDir, path);
            await Deno.mkdir(fullPath, { recursive: true });
            return fullPath;
        },
        async addFile(path: string, content: ReadableStream<Uint8Array | string>): Promise<string> {
            const fullPath = join(tempDir, path);
            const parentDirectories = dirname(fullPath);
            if (parentDirectories !== tempDir) {
                await Deno.mkdir(parentDirectories, { recursive: true });
            }
            const file = await Deno.open(fullPath, { write: true, create: true });
            const writer = file.writable.getWriter();
            const reader = content.getReader();
            const encoder = new TextEncoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (typeof value === 'string') {
                    await writer.write(encoder.encode(value));
                    continue;
                }
                await writer.write(value);
            }
            await writer.close();
            writer.releaseLock();
            reader.releaseLock();
            return fullPath;
        },
    };
}
