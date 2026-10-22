import { replace } from './fs/replace.ts';
import { write } from './fs/write.ts';
import { read, type ReadBinaryOptions, type ReadTextOptions } from './fs/read.ts';
import { cleanupTempResources } from './fs/temp/cleanup-temp-resources.ts';
import { makeDirectory } from './fs/make-directory.ts';
import { makeTempDirectory, type TempDirectory } from './fs/make-temp-directory.ts';

export interface Fs {
    makeTempDirectory(): Promise<TempDirectory>;
    makeDirectory(path: string): Promise<void>;
    replace(source: string, target: string): Promise<void>;
    read(filePath: string, options?: ReadBinaryOptions): Promise<ReadableStream<Uint8Array>>;
    read(filePath: string, options: ReadTextOptions): Promise<ReadableStream<string>>;
    write(filePath: string, content: ReadableStream<Uint8Array | string>): Promise<void>;
    cleanup(): Promise<void>;
    exists(path: string): Promise<boolean>;
}

export const Fs: Fs = {
    makeTempDirectory,
    makeDirectory,
    replace,
    read,
    write,
    cleanup: cleanupTempResources,
    exists: async (path: string): Promise<boolean> => {
        try {
            await Deno.stat(path);
            return true;
        } catch {
            return false;
        }
    },
};
