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
    globalInstructionFile: InstructionFile;
};

export async function getInstructionFiles(installRoot: string): Promise<InstructionFiles> {
    const root = join(installRoot, Path.INSTRUCTIONS_DIR);
    const skillsRoot = join(root, 'skills');
    const skillEntries = await Array.fromAsync(Deno.readDir(skillsRoot));
    const [skills, subagents, globalInstructionFile] = await Promise.all([
        Promise.all(skillEntries.map(async (entry): Promise<Skill> => ({
            name: entry.name,
            files: await readFiles(join(skillsRoot, entry.name)),
        }))),
        readFiles(join(root, 'agents')),
        readFile(root, 'AGENTS.md'),
    ]);
    return { skills, subagents, globalInstructionFile };
}

async function readFiles(root: string, prefix = ''): Promise<InstructionFile[]> {
    const entries = await Array.fromAsync(Deno.readDir(join(root, prefix)));
    const files = await Promise.all(entries.map((entry) => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory ? readFiles(root, path) : readFile(root, path);
    }));
    return files.flat();
}

async function readFile(root: string, path: string): Promise<InstructionFile> {
    return { path, content: await Deno.readFile(join(root, path)) };
}
