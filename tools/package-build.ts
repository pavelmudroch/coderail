import { crc32, deflateRawSync } from 'node:zlib';

import { join, resolve } from '@std/path';

import { checkPackage, sha256 } from './check-package.ts';
import { compilerVersion, type PackageOptions, parsePackageArguments } from './package-options.ts';

type Entry = { name: string; data: Uint8Array };
export type Compile = (root: string, options: PackageOptions, executable: string) => Promise<void>;

async function command(cwd: string, executable: string, args: string[]): Promise<string> {
    const result = await new Deno.Command(executable, {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    const decoder = new TextDecoder();
    if (!result.success) {
        throw new Error(
            `${executable} ${args.join(' ')} failed (${result.code}):\n${decoder.decode(result.stderr)}${decoder.decode(result.stdout)}`,
        );
    }
    return decoder.decode(result.stdout).trim();
}

export async function verifySource(root: string, options: PackageOptions): Promise<void> {
    parsePackageArguments([
        '--target',
        options.target,
        '--version',
        options.version,
        '--commit',
        options.commit,
        '--output',
        options.output,
    ]);
    if ((await command(root, 'git', ['rev-parse', 'HEAD'])) !== options.commit) {
        throw new Error('HEAD does not match supplied commit');
    }
    if (await command(root, 'git', ['status', '--porcelain', '--untracked-files=no'])) {
        throw new Error('Packaging requires clean tracked source inputs');
    }
    const source = await Deno.readTextFile(join(root, 'src/cli/version.ts'));
    const matches = [...source.matchAll(/export const CODERAIL_VERSION = '([^']+)';/g)];
    if (
        matches.length !== 1 ||
        (options.version !== 'canary' && matches[0]?.[1] !== options.version)
    ) {
        throw new Error('Stable package version must match source version');
    }
}

const compile: Compile = async (root, options, executable) => {
    if (Deno.version.deno !== compilerVersion) {
        throw new Error(
            `Packaging requires pinned Deno ${compilerVersion}; found ${Deno.version.deno}`,
        );
    }
    // Permissions belong to the compiled CLI. Deno resolves target-specific npm
    // optional dependencies in the actual src/main.ts graph, not all config imports.
    await command(root, Deno.execPath(), [
        'compile',
        '-A',
        '--target',
        options.target,
        '--output',
        executable,
        'src/main.ts',
    ]);
};

async function resources(root: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    async function walk(source: string, name: string): Promise<void> {
        const info = await Deno.lstat(source);
        if (info.isDirectory) {
            const children = Array.from(Deno.readDirSync(source)).sort((a, b) =>
                a.name.localeCompare(b.name),
            );
            for (const child of children) {
                await walk(join(source, child.name), `${name}/${child.name}`);
            }
        } else if (info.isFile && name.includes('/')) {
            const data = await Deno.readFile(source);
            if (data.length === 0) {
                throw new Error(`Empty resource file: ${name}`);
            }
            entries.push({ name, data });
        } else {
            throw new Error(`Resource must be a regular file or directory: ${name}`);
        }
    }
    const assets = join(root, 'assets');
    try {
        if (!(await Deno.lstat(assets)).isDirectory) {
            throw new Error('assets must be a real directory');
        }
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return [];
        }
        throw error;
    }
    for (const name of ['instructions', 'templates']) {
        const source = join(assets, name);
        try {
            await Deno.lstat(source);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                continue;
            }
            throw error;
        }
        await walk(source, name);
    }
    return entries;
}

// Classic single-disk ZIP, deflated entries with known sizes and CRCs. No
// descriptors, extra fields, comments or directory placeholders are emitted.
function zip(entries: Entry[]): Uint8Array {
    if (entries.length > 10000) {
        throw new Error('Too many archive entries');
    }
    const locals: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    let expanded = 0;
    const encoder = new TextEncoder();
    for (const entry of entries) {
        expanded += entry.data.length;
        if (expanded > 1024 * 1024 * 1024) {
            throw new Error('Oversized expanded archive');
        }
        const name = encoder.encode(entry.name);
        if (name.length > 65535) {
            throw new Error('Archive path too long');
        }
        const data = deflateRawSync(entry.data);
        const local = new Uint8Array(30 + name.length + data.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true);
        l.setUint16(4, 20, true);
        l.setUint16(8, 8, true);
        l.setUint16(12, 33, true); // 1980-01-01
        l.setUint32(14, crc32(entry.data), true);
        l.setUint32(18, data.length, true);
        l.setUint32(22, entry.data.length, true);
        l.setUint16(26, name.length, true);
        local.set(name, 30);
        local.set(data, 30 + name.length);
        const header = new Uint8Array(46 + name.length);
        const c = new DataView(header.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 0x0314, true);
        c.setUint16(6, 20, true);
        c.setUint16(10, 8, true);
        c.setUint16(14, 33, true);
        c.setUint32(16, crc32(entry.data), true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, entry.data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(
            38,
            (entry.name === 'cr' || entry.name === 'cr.exe' ? 0o100755 : 0o100644) * 65536,
            true,
        );
        c.setUint32(42, offset, true);
        header.set(name, 46);
        locals.push(local);
        central.push(header);
        offset += local.length;
    }
    const directory = central.reduce((sum, item) => sum + item.length, 0);
    if (offset + directory + 22 > 512 * 1024 * 1024) {
        throw new Error('Oversized archive');
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, entries.length, true);
    e.setUint16(10, entries.length, true);
    e.setUint32(12, directory, true);
    e.setUint32(16, offset, true);
    const result = new Uint8Array(offset + directory + 22);
    let position = 0;
    for (const item of [...locals, ...central, end]) {
        result.set(item, position);
        position += item.length;
    }
    return result;
}

export async function packageRelease(
    options: PackageOptions,
    cwd = Deno.cwd(),
    compiler: Compile = compile,
): Promise<void> {
    let step = 'source identity';
    let temporary: string | undefined;
    try {
        const root = await command(cwd, 'git', ['rev-parse', '--show-toplevel']);
        await verifySource(root, options);
        step = 'source snapshot';
        temporary = await Deno.makeTempDir({ prefix: 'coderail-package-' });
        const snapshot = join(temporary, 'source');
        // Compile committed files only; untracked/ignored files cannot alter identity.
        await command(root, 'git', [
            'clone',
            '--quiet',
            '--no-hardlinks',
            '--no-checkout',
            root,
            snapshot,
        ]);
        await command(snapshot, 'git', ['checkout', '--quiet', '--detach', options.commit]);
        step = 'resource collection';
        const files = await resources(snapshot);
        const executable = join(temporary, options.target.includes('windows') ? 'cr.exe' : 'cr');
        step = 'compilation';
        await compiler(snapshot, options, executable);
        if (!(await Deno.lstat(executable)).isFile) {
            throw new Error('Compiler did not produce a regular executable');
        }
        step = 'archive production';
        const build = {
            schemaVersion: 1,
            version: options.version,
            commit: options.commit,
            target: options.target,
        };
        const bytes = zip([
            {
                name: options.target.includes('windows') ? 'cr.exe' : 'cr',
                data: await Deno.readFile(executable),
            },
            { name: 'build.json', data: new TextEncoder().encode(JSON.stringify(build)) },
            ...files,
        ]);
        const name = `coderail-${options.target}.zip`;
        await Deno.writeFile(join(temporary, name), bytes);
        const sidecar = `${await sha256(bytes)}  ${name}\n`;
        await Deno.writeTextFile(join(temporary, `${name}.sha256`), sidecar);
        step = 'package validation';
        await checkPackage({ ...options, output: temporary });
        await verifySource(root, options);
        step = 'write outputs';
        const output = resolve(cwd, options.output);
        // Refuse existing names before writing either output; final checksum is
        // written last, so an interrupted pair never counts as a checked package.
        for (const file of [name, `${name}.sha256`]) {
            try {
                await Deno.lstat(join(output, file));
            } catch (error) {
                if (error instanceof Deno.errors.NotFound) {
                    continue;
                }
                throw error;
            }
            throw new Error(`Output already exists: ${file}`);
        }
        await Deno.mkdir(output, { recursive: true });
        await Deno.writeFile(join(output, name), bytes, { createNew: true });
        await Deno.writeTextFile(join(output, `${name}.sha256`), sidecar, { createNew: true });
    } catch (error) {
        throw new Error(
            `Package failed during ${step}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    } finally {
        if (temporary) {
            await Deno.remove(temporary, { recursive: true });
        }
    }
}
