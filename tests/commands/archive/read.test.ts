import { expect } from '@std/expect';

import { Read } from '../../../src/commands/archive/read.ts';
import { archiveFiles, artifactPath, rawFile, withArchiveFixture } from '../../archive/fixtures.ts';
import { runArchiveCommand } from './fixtures.ts';

Deno.test('archive read preserves file bytes with and without JSON', async () => {
    const read = new Read();
    expect(read.requiresInit).toBe(false);
    expect(read.getSubcommand()).toBeUndefined();
    expect(read.getUsage()).toContain(
        'cr archive read [--help] [--json] <batch-id>/<path-to-file>',
    );
    expect(read.shouldHandleHelp(read.parseArguments(['--help']))).toBe(true);
    expect(read.shouldHandleHelp(read.parseArguments([artifactPath]))).toBe(false);
    expect(() => read.parseArguments([])).toThrow('Missing required arguments.');

    await withArchiveFixture(archiveFiles, async (root) => {
        const bytes: number[] = [];
        const original = Deno.stdout.writeSync;
        Deno.stdout.writeSync = (buffer): number => {
            bytes.push(...buffer);
            return buffer.length;
        };
        try {
            for (const args of [[artifactPath], ['--json', '--', artifactPath]]) {
                bytes.length = 0;
                await runArchiveCommand(read, root, args);
                expect(new Uint8Array(bytes)).toEqual(rawFile);
            }
        } finally {
            Deno.stdout.writeSync = original;
        }
    });
});
