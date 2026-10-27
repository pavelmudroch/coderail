import { Fs } from '@fs';
import type { Manifest } from '../install-manifest.ts';
import { validate } from './validate.ts';

export async function load(path: string): Promise<Manifest | null> {
    let stream: ReadableStream<Uint8Array>;
    try {
        stream = await Fs.read(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
    }
    const manifest: unknown = JSON.parse(await new Response(stream).text());
    validate(manifest);
    return manifest;
}
