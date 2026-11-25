import { expect } from '@std/expect';

import { Tickets } from '../../../src/commands/archive/tickets.ts';
import { archiveFiles, batch, ticketPath, withArchiveFixture } from '../../archive/fixtures.ts';
import { archiveTextOutput } from './fixtures.ts';

Deno.test('archive tickets lists archived tickets by ID', async () => {
    const tickets = new Tickets();
    expect(tickets.requiresInit).toBe(false);
    expect(tickets.getSubcommand()).toBeUndefined();
    expect(tickets.getUsage()).toContain('cr archive tickets [--help] [--json] <batch-id>');
    expect(tickets.shouldHandleHelp(tickets.parseArguments(['--help']))).toBe(true);
    expect(tickets.shouldHandleHelp(tickets.parseArguments([batch]))).toBe(false);
    expect(() => tickets.parseArguments([])).toThrow('Missing required arguments.');

    await withArchiveFixture(archiveFiles, async (root) => {
        const output = (...args: string[]): Promise<string> =>
            archiveTextOutput(tickets, root, ...args);
        expect(await output(batch)).toBe(
            `0009  Small ticket  ${ticketPath}\n` +
                `9999  Last four digits  ${batch}/tickets/9999-last-four.md\n` +
                `10000  Large ticket  ${batch}/tickets/10000-large.md\n`,
        );
        expect(await output('2026-11-25_zulu')).toBe('No archived tickets in "2026-11-25_zulu".\n');
        expect(JSON.parse(await output(batch, '--json'))[0]).toEqual({
            id: '0009',
            title: 'Small ticket',
            path: ticketPath,
        });
    });
});
