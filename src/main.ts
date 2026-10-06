function main(): void {
    Deno.addSignalListener('SIGINT', () => {
        // clean up resources before exiting
    });

    try {
        // main logic goes here
    } catch (error) {
        return;
    }

    Deno.exitCode = 0;
    return;
}

Deno.exit();
