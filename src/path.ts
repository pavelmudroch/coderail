import { isWithin } from './path/is-within.ts';

export interface Path {
    /**
     * Checks if the given path is within the specified root directory.
     * @param path The path to check.
     * @param root The root directory to check against.
     * @returns `true` if the path is within the root directory, `false` otherwise.
     */
    isWithin(path: string, root: string): boolean;
}

export const Path: Path = { isWithin };
