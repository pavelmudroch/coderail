import type { TempFile } from '../make-temp-file.ts';

type TempContext = {
    registeredResourcePaths: string[];
    registeredFiles: Set<TempFile>;
};

export const tempContext: TempContext = {
    registeredResourcePaths: [],
    registeredFiles: new Set(),
};
