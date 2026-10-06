import { Mutasaurus } from '@mutasaurus/mutasaurus';

const [sourceFile, testFile] = Deno.args;
if (!Deno.statSync(sourceFile).isFile) {
    console.log('Source file not found:', sourceFile);
    Deno.exit(1);
}

if (!Deno.statSync(testFile).isFile) {
    console.log('No tests found for file:', sourceFile);
    Deno.exit(0);
}

const mutasaurus = new Mutasaurus({
    sourceFiles: [sourceFile],
    testFiles: [testFile],
    silent: true,
});
console.log('Running mutation tests...');
const result = await mutasaurus.run();
Deno.exitCode = result.survivedMutations;

if (result.survivedMutations > 0) {
    console.error('Survived mutations detected:');
    console.error(result);
}
