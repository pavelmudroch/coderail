import { Mutasaurus } from '@mutasaurus/mutasaurus';
import { dirname, join } from '@std/path';

const [testFile, sourceFileOrDir] = Deno.args;
if (testFile === undefined) {
    console.error('Test file not specified.');
    Deno.exit(0);
}

if (sourceFileOrDir === undefined) {
    console.error('Source file not specified.');
    Deno.exit(0);
}

if (!isFile(testFile)) {
    console.error('Test file not found:', testFile);
    Deno.exit(0);
}

const sourceFiles: string[] = [];
if (isFile(`${sourceFileOrDir}.ts`)) {
    sourceFiles.push(`${sourceFileOrDir}.ts`);
} else if (isDirectory(sourceFileOrDir)) {
    sourceFiles.push(...getDirectoryFiles(sourceFileOrDir));
} else {
    console.error('Source file or directory not found:', sourceFileOrDir);
    Deno.exit(0);
}

const exhaustiveMode = enableExhaustiveMode(testFile);

const mutasaurus = new Mutasaurus({
    sourceFiles: sourceFiles,
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
    } catch {
        return false;
    }
}

function isDirectory(path: string): boolean {
    try {
        return Deno.statSync(path).isDirectory;
    } catch {
        return false;
    }
}

function isFile(path: string): boolean {
    try {
        return Deno.statSync(path).isFile;
    } catch {
        return false;
    }
}

function getDirectoryFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of Deno.readDirSync(dir)) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile && fullPath.endsWith('.ts')) {
            files.push(fullPath);
        }
    }
    return files;
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
