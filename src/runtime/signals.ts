export interface SignalHandlers extends Disposable {
    readonly signal: AbortSignal;
}

export function registerSignalHandlers(): SignalHandlers {
    const controller = new AbortController();
    const signal = controller.signal;

    const signalHandlers: SignalHandlers = {
        signal,
        [Symbol.dispose]: () => {},
    };
    const handleSignal = () => controller.abort();
    Deno.addSignalListener('SIGINT', handleSignal);
    if (Deno.build.os === 'windows') {
        Deno.addSignalListener('SIGBREAK', handleSignal);
        signalHandlers[Symbol.dispose] = () => {
            Deno.removeSignalListener('SIGINT', handleSignal);
            Deno.removeSignalListener('SIGBREAK', handleSignal);
        };
    } else {
        Deno.addSignalListener('SIGTERM', handleSignal);
        signalHandlers[Symbol.dispose] = () => {
            Deno.removeSignalListener('SIGINT', handleSignal);
            Deno.removeSignalListener('SIGTERM', handleSignal);
        };
    }
    return signalHandlers;
}
