export async function getFileStream(path: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
        const file = await Deno.open(path);
        return file.readable;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return null;
        }

        throw new Error(`Failed to open file "${path}"`, { cause: error });
    }
}
