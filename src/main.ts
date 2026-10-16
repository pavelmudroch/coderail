import { Cli } from '@cli';
import { Commands } from '@commands';
import { Log } from '@log';
import { Runtime } from '@runtime';

async function main(): Promise<void> {
    using signalHandlers = Runtime.registerSignalHandlers();

    try {
        await Commands.run(Deno.args, signalHandlers.signal);
    } catch (error) {
        reportFailure(error, signalHandlers.signal);
    } finally {
        await Runtime.cleanup();
    }
}

function reportFailure(error: unknown, signal: AbortSignal): void {
    if (Cli.isUsageError(error)) {
        Deno.exitCode = 2;
        Log.error(error);
        Log.info(error.usage());
        return;
    }

    if (Deno.exitCode === 0) {
        Deno.exitCode = 1;
    }

    if (signal.aborted) {
        Log.warn('Operation was aborted');
        return;
    }
    Log.error(error);
    Log.trace(error);
}

await main();
