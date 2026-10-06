import { replace } from './fs/replace.ts';
import { write } from './fs/write.ts';

export interface Fs {
    replace(source: string, target: string): Promise<void>;
    write(filePath: string, content: string): Promise<void>;
}

export const Fs: Fs = { replace, write };
