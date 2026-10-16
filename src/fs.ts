import { replace } from './fs/replace.ts';
import { write } from './fs/write.ts';
import { cleanupTempResources } from './fs/temp/cleanup-temp-resources.ts';

export interface Fs {
    replace(source: string, target: string): Promise<void>;
    write(filePath: string, content: string): Promise<void>;
    cleanup(): Promise<void>;
}

export const Fs: Fs = {
    replace,
    write,
    cleanup: cleanupTempResources,
};
