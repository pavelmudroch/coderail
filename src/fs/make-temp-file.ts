import { parse, resolve, SEPARATOR } from '@std/path';

import { tempContext } from './temp/ctx.ts';

export interface TempFile {
    readonly path: string;
    remove(): Promise<void>;
}

export async function makeTempFile(path: string): Promise<TempFile> {
    // Resolve the root without collapsing path components that may traverse symlinks.
    const { root } = parse(path);
    const anchor = resolve(root);
    const separator = anchor.endsWith(SEPARATOR) ? '' : SEPARATOR;
    const location = anchor + separator + path.slice(root.length);
    const file = await Deno.open(location, { write: true, createNew: true });
    file.close();

    let removal: Promise<void> | undefined;
    const resource: TempFile = {
        path,
        remove() {
            return (removal ??= release());
        },
    };
    tempContext.registeredFiles.add(resource);
    return resource;

    async function release(): Promise<void> {
        try {
            await Deno.remove(location);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                removal = undefined;
                throw error;
            }
        }
        tempContext.registeredFiles.delete(resource);
    }
}
