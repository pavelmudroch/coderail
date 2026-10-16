import { Fs } from '@fs';
import { Log } from '@log';

export async function cleanup(): Promise<void> {
    const cleanupResults = await Promise.allSettled([
        Fs.cleanup(),
    ]);
    for (const result of cleanupResults) {
        if (result.status === 'rejected') {
            Log.trace('Cleanup failure', result.reason);
        }
    }
}
