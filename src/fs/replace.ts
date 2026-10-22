export function replace(source: string, target: string): Promise<void> {
    return Deno.rename(source, target);
}
