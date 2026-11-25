import { expect } from '@std/expect';

import { ARCHIVE_REF } from '../../../src/archive/history.ts';
import { List } from '../../../src/commands/archive/list.ts';
import { archiveFiles, batch, fixtureGit, withArchiveFixture } from '../../archive/fixtures.ts';
import { archiveTextOutput } from './fixtures.ts';

Deno.test('archive list accepts help and JSON and outputs retained batch IDs', async () => {
    const list = new List();
    expect(list.requiresInit).toBe(false);
    expect(list.getSubcommand()).toBeUndefined();
    expect(list.getUsage()).toContain('cr archive list [--help] [--json]');
    expect(list.shouldHandleHelp(list.parseArguments(['--help']))).toBe(true);
    expect(list.shouldHandleHelp(list.parseArguments([]))).toBe(false);
    expect(() => list.parseArguments(['extra'])).toThrow('Too many arguments.');

    await withArchiveFixture(archiveFiles, async (root) => {
        const output = (...args: string[]): Promise<string> =>
            archiveTextOutput(list, root, ...args);
        const ids = [batch, '2026-11-25_zulu', '2026-11-24_previous'];
        expect(await output()).toBe(ids.join('\n') + '\n');
        expect(JSON.parse(await output('--json'))).toEqual(ids);
        await fixtureGit(root, 'update-ref', '-d', ARCHIVE_REF);
        expect(await output()).toBe('No archive batches.\n');
    });
});
