import { Log } from '@log';

export function printArchiveListing(
    items: readonly unknown[],
    json: boolean,
    lines: () => string[],
    emptyMessage: string,
): void {
    if (json) {
        writeArchiveJson(items);
    } else {
        Log.output(items.length === 0 ? emptyMessage : lines().join('\n'));
    }
}

export function writeArchiveJson(value: unknown): void {
    Log.output(JSON.stringify(value, null, 4));
}
