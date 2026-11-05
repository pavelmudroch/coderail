import { parsePackageArguments, usage } from './internal/package-options.ts';

if (import.meta.main) {
    try {
        const options = parsePackageArguments(Deno.args);
        if (options === 'help') {
            console.log(usage);
        } else {
            const { packageRelease } = await import('./internal/package-build.ts');
            await packageRelease(options);
            console.log(`Checked package ready: ${options.output}/coderail-${options.target}.zip`);
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        Deno.exitCode = 1;
    }
}
