export interface ConfFileStream extends Disposable {
    path: string;
    stream: ReadableStream<Uint8Array>;
}

export async function getFileStream(path: string): Promise<ConfFileStream | null> {
    try {
        const file = await Deno.open(path);
        const stream = file.readable;
        const dispose = () => file.close();

        return { path, stream, [Symbol.dispose]: dispose };
    }
    catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return null;
        }

        throw new Error(`Failed to open file "${path}"`, { cause: error });
    }
}
