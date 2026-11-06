import { Fs } from '@fs';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { getInstructionFiles } from '../../../src/commands/helpers/get-instruction-files.ts';

Deno.test(
    'Instruction loading accepts absent and partial bundles without losing empty skills',
    async () => {
        await using root = await temporaryRoot();
        const empty = { skills: [], subagents: [], globalInstructionFile: null };
        expect(await getInstructionFiles(root.path)).toEqual(empty);
        await Deno.mkdir(join(root.path, 'instructions'));
        expect(await getInstructionFiles(root.path)).toEqual(empty);
        await Deno.writeTextFile(join(root.path, 'instructions/AGENTS.md'), 'general');
        expect((await getInstructionFiles(root.path)).globalInstructionFile).toEqual({
            path: 'AGENTS.md',
            content: new TextEncoder().encode('general'),
        });
        await Deno.remove(join(root.path, 'instructions/AGENTS.md'));
        await Deno.mkdir(join(root.path, 'instructions/agents/nested'), { recursive: true });
        await Deno.writeTextFile(join(root.path, 'instructions/agents/nested/worker.md'), 'agent');
        expect((await getInstructionFiles(root.path)).subagents).toEqual([
            { path: 'nested/worker.md', content: new TextEncoder().encode('agent') },
        ]);
        await Deno.remove(join(root.path, 'instructions/agents'), { recursive: true });
        await Deno.mkdir(join(root.path, 'instructions/skills/empty'), { recursive: true });
        await Deno.mkdir(join(root.path, 'instructions/skills/support/nested'), {
            recursive: true,
        });
        await Deno.writeFile(
            join(root.path, 'instructions/skills/support/nested/data'),
            new Uint8Array([255]),
        );
        const result = await getInstructionFiles(root.path);
        expect(result.globalInstructionFile).toBeNull();
        expect(result.subagents).toEqual([]);
        expect(result.skills.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
            { name: 'empty', files: [] },
            { name: 'support', files: [{ path: 'nested/data', content: new Uint8Array([255]) }] },
        ]);
    },
);

Deno.test('Instruction loading propagates non-absence directory and file errors', async () => {
    await using root = await temporaryRoot();
    await Deno.mkdir(join(root.path, 'instructions/skills'), { recursive: true });
    await Deno.writeTextFile(join(root.path, 'instructions/AGENTS.md'), 'general');
    const read = Fs.read;
    const readDir = Deno.readDir;
    const denied = new Deno.errors.PermissionDenied('unreadable source');
    try {
        Fs.read = (): Promise<never> => Promise.reject(denied);
        await expect(getInstructionFiles(root.path)).rejects.toBe(denied);
        Fs.read = read;
        Deno.readDir = () => {
            throw denied;
        };
        await expect(getInstructionFiles(root.path)).rejects.toBe(denied);
    } finally {
        Fs.read = read;
        Deno.readDir = readDir;
    }
    await Deno.remove(join(root.path, 'instructions/skills'));
    await Deno.writeTextFile(join(root.path, 'instructions/skills'), 'not a directory');
    await expect(getInstructionFiles(root.path)).rejects.toBeInstanceOf(Deno.errors.NotADirectory);
});

async function temporaryRoot(): Promise<AsyncDisposable & { path: string }> {
    const path = await Deno.makeTempDir();
    return { path, [Symbol.asyncDispose]: () => Deno.remove(path, { recursive: true }) };
}
