import { isWithin } from './path/is-within.ts';

export interface Path {
    isWithin(path: string, root: string): boolean;
}

export const Path: Path = { isWithin };
