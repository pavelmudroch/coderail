import { replace } from './fs/replace.ts';
import { write } from './fs/write.ts';
import { read, type ReadBinaryOptions, type ReadTextOptions } from './fs/read.ts';
import { cleanupTempResources } from './fs/temp/cleanup-temp-resources.ts';
import { makeDirectory } from './fs/make-directory.ts';

export interface Fs {
    makeDirectory(path: string): Promise<void>;
    replace(source: string, target: string): Promise<void>;
    read(filePath: string, options?: ReadBinaryOptions): Promise<ReadableStream<Uint8Array>>;
    read(filePath: string, options: ReadTextOptions): Promise<ReadableStream<string>>;
    write(filePath: string, content: ReadableStream<Uint8Array | string>): Promise<void>;
    cleanup(): Promise<void>;
}

export const Fs: Fs = {
    makeDirectory,
    replace,
    read,
    write,
    cleanup: cleanupTempResources,
};
