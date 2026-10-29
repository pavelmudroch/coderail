const encoder = new TextEncoder();

export function writeSync(stream: Pick<typeof Deno.stderr, 'writeSync'>, message: string): void {
    const bytes = encoder.encode(message);
    let offset = 0;
    while (offset < bytes.length) {
        const written = stream.writeSync(bytes.subarray(offset));
        if (written === 0) {
            throw new Error('Unable to write log output');
        }
        offset += written;
    }
}
