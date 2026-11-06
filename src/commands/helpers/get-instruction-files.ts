import { Fs } from '@fs';
import { Path } from '@path';
import { join } from '@std/path';

export type InstructionFile = {
    path: string;
    content: Uint8Array;
};

export type Skill = {
    name: string;
    files: InstructionFile[];
};

export type InstructionFiles = {
    skills: Skill[];
    subagents: InstructionFile[];
    globalInstructionFile: InstructionFile | null;
};

export async function getInstructionFiles(installRoot: string): Promise<InstructionFiles> {
    const root = join(installRoot, Path.INSTRUCTIONS_DIR);
    const skillsRoot = join(root, 'skills');
    const skillEntries = await optional(() => Array.fromAsync(Deno.readDir(skillsRoot)), []);
    const [skills, subagents, globalInstructionFile] = await Promise.all([
        Promise.all(
            skillEntries
                .filter((entry) => entry.isDirectory)
                .map(async (entry): Promise<Skill> => ({
                    name: entry.name,
                    files: await readFiles(join(skillsRoot, entry.name)),
                })),
        ),
        readFiles(join(root, 'agents'), '', true),
        optional(() => readFile(root, 'AGENTS.md'), null),
    ]);
    return { skills, subagents, globalInstructionFile };
}

async function optional<T, F>(read: () => Promise<T>, fallback: F): Promise<T | F> {
    try {
        return await read();
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return fallback;
        }
        throw error;
    }
}

async function readFiles(
    root: string,
    prefix = '',
    optionalRoot = false,
): Promise<InstructionFile[]> {
    const readEntries = (): Promise<Deno.DirEntry[]> =>
        Array.fromAsync(Deno.readDir(join(root, prefix)));
    const entries = await (optionalRoot ? optional(readEntries, []) : readEntries());
    const files = await Promise.all(
        entries.map((entry) => {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            return entry.isDirectory ? readFiles(root, path) : readFile(root, path);
        }),
    );
    return files.flat();
}

async function readFile(root: string, path: string): Promise<InstructionFile> {
    const stream = await Fs.read(join(root, path));
    return { path, content: new Uint8Array(await new Response(stream).arrayBuffer()) };
}
