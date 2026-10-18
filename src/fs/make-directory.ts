export async function makeDirectory(path: string): Promise<void> {
    await Deno.mkdir(path, { recursive: true });
}
