export type ReadTextOptions = {
    text: true;
    binary?: never;
};
export type ReadBinaryOptions = {
    binary: true;
    text?: never;
};
export type ReadOptions = ReadTextOptions | ReadBinaryOptions;

export async function read(
    filePath: string,
    options?: ReadBinaryOptions,
): Promise<ReadableStream<Uint8Array>>;
export async function read(
    filePath: string,
    options: ReadTextOptions,
): Promise<ReadableStream<string>>;
export async function read(
    filePath: string,
    options?: ReadOptions,
): Promise<ReadableStream<string> | ReadableStream<Uint8Array>> {
    const file = await Deno.open(filePath, { read: true });
    if (options?.text) {
        return file.readable.pipeThrough(new TextDecoderStream());
    }

    return file.readable;
}
