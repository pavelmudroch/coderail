function main(): number {
	Deno.addSignalListener("SIGINT", () => {
		// clean up resources before exiting
	});

	try {
		// main logic goes here
	} catch (error) {
		// handle error here
	}

	return 0;
}

const exitCode = main();
Deno.exit(exitCode);
