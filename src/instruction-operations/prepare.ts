import { join } from '@std/path';
import type { ConnectorFile, HarnessConnector } from '../harness/connector.ts';

async function entries(path: string): Promise<Deno.DirEntry[]> {
    if (!(await Deno.lstat(path)).isDirectory) throw new Error(`Expected directory: ${path}`);
    return (await Array.fromAsync(Deno.readDir(path))).sort((a, b) => a.name < b.name ? -1 : 1);
}

async function file(root: string, path: string): Promise<ConnectorFile> {
    const source = join(root, path);
    if (!(await Deno.lstat(source)).isFile) throw new Error(`Expected source file: ${source}`);
    return { path, content: await Deno.readFile(source) };
}

async function skillFiles(root: string, prefix = ''): Promise<ConnectorFile[]> {
    const files: ConnectorFile[] = [];
    for (const entry of await entries(join(root, prefix))) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory) files.push(...await skillFiles(root, path));
        else files.push(await file(root, path));
    }
    return files;
}

/** Load the complete bundle before invoking translations; each call owns its bytes. */
export async function prepare(
    connector: HarnessConnector,
    root: string,
): Promise<ConnectorFile[]> {
    const layout = await entries(root);
    if (
        layout.length !== 3 ||
        layout.some((entry) => !['AGENTS.md', 'agents', 'skills'].includes(entry.name))
    ) throw new Error('Unexpected instruction bundle layout');
    const global = await file(root, 'AGENTS.md');
    const skills: { name: string; files: ConnectorFile[] }[] = [];
    for (const entry of await entries(join(root, 'skills'))) {
        const files = await skillFiles(join(root, 'skills', entry.name));
        if (!files.some((file) => file.path === 'SKILL.md')) {
            throw new Error(`Missing SKILL.md: ${entry.name}`);
        }
        skills.push({ name: entry.name, files });
    }
    const agents: ConnectorFile[] = [];
    for (const entry of await entries(join(root, 'agents'))) {
        agents.push(await file(join(root, 'agents'), entry.name));
    }
    const outputs = [...await connector.translateGlobalInstructions(global)];
    for (const skill of skills) {
        outputs.push(...await connector.translateSkill(skill.name, skill.files));
    }
    for (const agent of agents) outputs.push(...await connector.translateSubagent(agent));
    return outputs;
}
