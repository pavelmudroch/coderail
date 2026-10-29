import { expect } from '@std/expect';
import { dirname, join } from '@std/path';
import { Path } from '@path';
import { getInstructionFiles } from '../../../src/commands/helpers/get-instruction-files.ts';

Deno.test('getInstructionFiles reads all instruction bytes and nested skill files in parallel', async () => {
    const root = await Deno.makeTempDir();
    const instructionsRoot = join(root, Path.INSTRUCTIONS_DIR);
    const encoder = new TextEncoder();
    const files = new Map([
        ['AGENTS.md', encoder.encode('Global instructions')],
        ['agents/worker.md', encoder.encode('Worker instructions')],
        ['agents/reviewer.md', encoder.encode('Reviewer instructions')],
        ['skills/code/SKILL.md', encoder.encode('Code instructions')],
        ['skills/code/references/nested/data.bin', new Uint8Array([0, 128, 255])],
        ['skills/research/SKILL.md', encoder.encode('Research instructions')],
    ]);
    const originalReadFile = Deno.readFile;
    const gate = Promise.withResolvers<void>();
    let readsStarted = 0;
    let readsBeforeRelease = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        for (const [path, content] of files) {
            const target = join(instructionsRoot, path);
            await Deno.mkdir(dirname(target), { recursive: true });
            await Deno.writeFile(target, content);
        }
        const release = (): void => {
            readsBeforeRelease = readsStarted;
            gate.resolve();
        };
        timer = setTimeout(release, 1000);
        Deno.readFile = async (path, options): Promise<Uint8Array<ArrayBuffer>> => {
            readsStarted++;
            if (readsStarted === files.size) release();
            await gate.promise;
            return originalReadFile(path, options);
        };

        const result = await getInstructionFiles(root);
        expect(readsBeforeRelease).toBe(files.size);
        expect(result.globalInstructionFile).toEqual({
            path: 'AGENTS.md',
            content: files.get('AGENTS.md'),
        });
        expect(result.subagents.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
            { path: 'reviewer.md', content: files.get('agents/reviewer.md') },
            { path: 'worker.md', content: files.get('agents/worker.md') },
        ]);
        for (const skill of result.skills) {
            skill.files.sort((a, b) => a.path < b.path ? -1 : 1);
        }
        expect(result.skills.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
            {
                name: 'code',
                files: [
                    { path: 'SKILL.md', content: files.get('skills/code/SKILL.md') },
                    {
                        path: 'references/nested/data.bin',
                        content: files.get('skills/code/references/nested/data.bin'),
                    },
                ],
            },
            {
                name: 'research',
                files: [{ path: 'SKILL.md', content: files.get('skills/research/SKILL.md') }],
            },
        ]);
    } finally {
        clearTimeout(timer);
        gate.resolve();
        Deno.readFile = originalReadFile;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('getInstructionFiles propagates missing instruction directory errors', async () => {
    const root = await Deno.makeTempDir();
    try {
        await expect(getInstructionFiles(root)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
