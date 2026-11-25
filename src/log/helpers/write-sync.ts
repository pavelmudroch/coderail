const encoder = new TextEncoder();

export function writeSync(
    stream: Pick<typeof Deno.stderr, 'writeSync'>,
    message: string | Uint8Array,
): void {
    const bytes = typeof message === 'string' ? encoder.encode(message) : message;
    let offset = 0;
    while (offset < bytes.length) {
        const written = stream.writeSync(bytes.subarray(offset));
        if (written === 0) {
            throw new Error('Unable to write log output');
        }
        offset += written;
    }
}
