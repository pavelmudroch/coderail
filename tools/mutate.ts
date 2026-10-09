import { Mutasaurus } from '@mutasaurus/mutasaurus';
import { dirname, join } from '@std/path';

const [sourceFile, testFile] = Deno.args;
const exhaustiveMode = enableExhaustiveMode(testFile);

if (!Deno.statSync(sourceFile).isFile) {
    console.log('Source file not found:', sourceFile);
    Deno.exit(0);
}

if (!Deno.statSync(testFile).isFile) {
    console.log('No tests found for file:', sourceFile);
    Deno.exit(0);
}

const mutasaurus = new Mutasaurus({
    sourceFiles: [sourceFile],
    testFiles: [testFile],
    silent: true,
    exhaustiveMode: exhaustiveMode,
});
console.log('Running mutation tests...');
const result = await mutasaurus.run();
inspectResult(result);
Deno.exitCode = result.survivedMutations;

function enableExhaustiveMode(testFile: string): boolean {
    const testDir = dirname(testFile);
    try {
        return Deno.statSync(join(testDir, '.exhaustive')).isFile;
    }
    catch {
        return false;
    }
}

function inspectResult(result: Awaited<ReturnType<typeof mutasaurus.run>>): void {
    const {
        totalMutations,
        incompleteMutations,
        killedMutations,
        survivedMutations,
        totalTime,
        typeErrorMutations,
        timedOutMutations,
        erroneousMutations,
    } = result;
    const resultSummary = {
        totalMutations,
        incompleteMutations,
        killedMutations,
        typeErrorMutations,
        survivedMutations,
        timedOutMutations,
        erroneousMutations,
        totalTime,
    };

    if (result.survivedMutations > 0) {
        console.error('Survived mutations detected:');
        for (const mutation of result.mutations) {
            if (mutation.status !== 'survived') {
                continue;
            }

            const path = mutation.original.path;
            const operator = mutation.operator;
            const originalLines = mutation.original.content.split('\n');
            const mutatedLines = mutation.mutation.split('\n');
            for (let i = 0; i < originalLines.length; i++) {
                const originalLine = originalLines[i];
                const mutatedLine = mutatedLines[i];
                if (originalLine !== mutatedLine) {
                    console.log(`File: "${path}" at line ${i + 1}`);
                    console.log(`Operator: ${operator}`);
                    console.log(`Original line: ${originalLine}`);
                    console.log(`Mutated line:  ${mutatedLine}`);
                    break;
                }
            }
        }
        console.error(resultSummary);
        return;
    }

    if (result.totalMutations === 0) {
        console.warn('No mutations were generated.');
    }

    console.log('Mutation testing complete.');
    console.log(resultSummary);
}
