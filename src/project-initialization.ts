import { Fs } from '@fs';
import { Log } from '@log';
import { join } from '@std/path';

export const projectIgnoreLines = [
    '*',
    '!.gitignore',
    '!config',
    '!plans/',
    '!plans/**',
    '!tickets/',
    '!tickets/**',
] as const;

type CollectedInput = { original: string | undefined };

async function ensureConfig(
    projectRoot: string,
    signal: AbortSignal,
    collected?: CollectedInput,
): Promise<void> {
    signal.throwIfAborted();
    const filePath = join(projectRoot, '.coderail', 'config');
    if (collected) {
        await writeInitialization(filePath, defaultConfigContent(), signal, collected);
        return;
    }
    try {
        const fileInfo = await Deno.lstat(filePath);
        if (!fileInfo.isFile && !fileInfo.isSymlink) {
            throw new Error(`Expected "${filePath}" to be a file or a symlink.`);
        }
        Log.notice(`Found existing configuration file at "${filePath}".`);
    } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
        signal.throwIfAborted();
        await writeInitialization(filePath, defaultConfigContent(), signal, collected);
        Log.notice(`Created new configuration file at "${filePath}".`);
    }
    signal.throwIfAborted();
}

async function ensureIgnoreRules(
    projectRoot: string,
    signal: AbortSignal,
    collected?: CollectedInput,
): Promise<void> {
    signal.throwIfAborted();
    const ignorePath = join(projectRoot, '.coderail', '.gitignore');
    let original: string;
    if (collected) {
        original = collected.original ?? '';
    } else {
        try {
            original = await Deno.readTextFile(ignorePath, { signal });
        } catch (error) {
            signal.throwIfAborted();
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
            original = '';
        }
    }
    const lines = original.split(/\r?\n/);
    let repaired = lines[0] === '*' ? original : '*\n' + original;
    for (const line of projectIgnoreLines.slice(1)) {
        if (!lines.includes(line)) {
            if (!repaired.endsWith('\n')) {
                repaired += '\n';
            }
            repaired += line + '\n';
        }
    }
    signal.throwIfAborted();
    if (repaired !== original) {
        await writeInitialization(ignorePath, new Blob([repaired]).stream(), signal, collected);
    }
    signal.throwIfAborted();
}

/** Init retains its replacement behavior; doctor writes only against its collected input. */
async function writeInitialization(
    path: string,
    content: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    collected: CollectedInput | undefined,
): Promise<void> {
    if (!collected) {
        await Fs.write(path, content);
        return;
    }
    const bytes = new Uint8Array(await new Response(content).arrayBuffer());
    signal.throwIfAborted();
    // Exclusive creation makes publication fail even if the destination appears during preparation.
    using file = await Deno.open(path, {
        read: true,
        write: true,
        createNew: collected.original === undefined,
    });
    signal.throwIfAborted();
    if (collected.original !== undefined) {
        // Recheck after preparation and opening. Keep the check and descriptor write synchronous,
        // so asynchronous work cannot intervene and a replaced path is never overwritten by rename.
        const info = Deno.lstatSync(path);
        const opened = file.statSync();
        if (
            !info.isFile ||
            info.ino !== opened.ino ||
            info.dev !== opened.dev ||
            Deno.readTextFileSync(path) !== collected.original
        ) {
            throw new Error(`Collected input changed at "${path}"`);
        }
    }
    let written = 0;
    while (written < bytes.length) {
        written += file.writeSync(bytes.subarray(written));
    }
    file.truncateSync(bytes.length);
}

export const ProjectInitialization = { ensureConfig, ensureIgnoreRules };

function defaultConfigContent(): ReadableStream<Uint8Array> {
    const configContentLines = [
        '# Coderail configuration file, lines starting with "#" are comments.',
        '# Example:',
        '# default_harness = codex',
        '',
        '# Add your verification configuration here.',
        '# Example:',
        '# Optional global actions (place before rule entries):',
        '# [verify]',
        '# pre = [["mkdir", "-p", "coverage"]]',
        '# post = [["rm", "-rf", ".mutation-tmp"]]',
        '#',
        '# [[verify.rules]]',
        '# pattern = src/${path:**}/${file:*}.ts',
        '# commands = [',
        '#   ["command", "argument_1", "argument_2"]',
        '# ]',
    ];
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller): void {
            for (const line of configContentLines) {
                controller.enqueue(encoder.encode(line + '\n'));
            }
            controller.close();
        },
    });
}
