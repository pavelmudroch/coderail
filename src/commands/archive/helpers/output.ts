import { Log } from '@log';

import { writeSync } from '../../../log/helpers/write-sync.ts';

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
    writeSync(Deno.stdout, `${JSON.stringify(value, null, 2)}\n`);
}
