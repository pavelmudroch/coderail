import { expect } from '@std/expect';
import { join } from '@std/path';

import {
    ARCHIVE_REF,
    getArchiveTip,
    listArchiveBatches,
    listArchivedPlans,
    listArchivedTickets,
    readArchivedFile,
    readArchiveTree,
} from '../../src/archive/history.ts';
import {
    archiveFiles,
    artifactPath,
    batch,
    expectedPlans,
    fixtureGit,
    rawFile,
    ticketPath,
    withArchiveFixture,
} from './fixtures.ts';

const signal = new AbortController().signal;

Deno.test(
    'archive history discovers exact committed batches, ideas, artifacts and tickets',
    async () => {
        await withArchiveFixture(archiveFiles, async (root) => {
            const tip = await fixtureGit(root, 'rev-parse', ARCHIVE_REF);
            expect(await getArchiveTip(root, signal)).toBe(tip);
            const entries = await readArchiveTree(root, tip, signal);
            expect(entries.find(({ path }) => path === batch)).toEqual({
                path: batch,
                type: 'tree',
                oid: await fixtureGit(root, 'rev-parse', `${tip}:${batch}`),
            });
            expect(entries.map(({ path }) => path)).toEqual([
                '2026-11-24_previous',
                batch,
                '2026-11-25_zulu',
                '2026-11-27_file',
                'a-directory',
            ]);
            expect(await listArchiveBatches(root, signal)).toEqual([
                batch,
                '2026-11-25_zulu',
                '2026-11-24_previous',
            ]);
            expect(await listArchivedPlans(root, batch, signal)).toEqual(expectedPlans);
            expect(await listArchivedPlans(root, '2026-11-25_zulu', signal)).toEqual([]);
            expect(await listArchivedTickets(root, '2026-11-25_zulu', signal)).toEqual([]);
            expect(await listArchivedTickets(root, batch, signal)).toEqual([
                { id: '0009', title: 'Small ticket', path: ticketPath },
                {
                    id: '9999',
                    title: 'Last four digits',
                    path: `${batch}/tickets/9999-last-four.md`,
                },
                { id: '10000', title: 'Large ticket', path: `${batch}/tickets/10000-large.md` },
            ]);
            expect(await listArchivedTickets(root, '2026-11-24_previous', signal)).toEqual([
                {
                    id: '0009',
                    title: 'Other ticket',
                    path: '2026-11-24_previous/tickets/0009-other.md',
                },
            ]);
            expect(await readArchivedFile(root, artifactPath, signal)).toEqual(rawFile);
            expect(await readArchivedFile(root, '2026-11-25_zulu/README.md', signal)).toEqual(
                new Uint8Array(),
            );
        });
    },
);

Deno.test('archive history distinguishes directory, absent, and escaping requests', async () => {
    await withArchiveFixture(archiveFiles, async (root) => {
        for (const path of [batch, `${batch}/plans/`, `${batch}/plans/parent`]) {
            await expect(readArchivedFile(root, path, signal)).rejects.toThrow('is a directory');
        }
        for (const path of [`${batch}/missing.md`, `${batch}/README.md/`]) {
            await expect(readArchivedFile(root, path, signal)).rejects.toThrow('was not found');
        }
        for (const path of [
            `/${batch}/README.md`,
            `${batch}//README.md`,
            `${batch}/./README.md`,
            `${batch}/../2026-11-25_zulu/README.md`,
            `${batch}/zero\0byte`,
        ]) {
            await expect(readArchivedFile(root, path, signal)).rejects.toThrow(
                'must stay within one batch',
            );
        }
        for (const id of ['2026-12-01_unknown', '2026-11-27_file', 'a-directory']) {
            await expect(readArchivedFile(root, `${id}/README.md`, signal)).rejects.toThrow(
                `Unknown archive batch "${id}".`,
            );
        }
    });
});

Deno.test(
    'archive history distinguishes absent local ref, broken ref and Git failures',
    async () => {
        const outside = await Deno.makeTempDir();
        try {
            await expect(getArchiveTip(outside, signal)).rejects.toThrow('Git for-each-ref failed');
        } finally {
            await Deno.remove(outside, { recursive: true });
        }

        await withArchiveFixture({}, async (root) => {
            const tip = await fixtureGit(root, 'rev-parse', ARCHIVE_REF);
            await fixtureGit(root, 'update-ref', '-d', ARCHIVE_REF);
            await fixtureGit(root, 'update-ref', `${ARCHIVE_REF}/child`, tip);
            expect(await getArchiveTip(root, signal)).toBeUndefined();
            expect(await listArchiveBatches(root, signal)).toEqual([]);
            await expect(listArchivedPlans(root, batch, signal)).rejects.toThrow(
                'Unknown archive batch',
            );
            await expect(readArchiveTree(root, 'nonexistent', signal)).rejects.toThrow(
                'Git ls-tree failed',
            );
            await fixtureGit(root, 'update-ref', '-d', `${ARCHIVE_REF}/child`);
            await Deno.remove(join(root, '.git', ARCHIVE_REF), { recursive: true }).catch(
                (error) => {
                    if (!(error instanceof Deno.errors.NotFound)) {
                        throw error;
                    }
                },
            );
            await Deno.mkdir(join(root, '.git', 'refs', 'heads', 'coderail'), { recursive: true });
            await Deno.writeTextFile(join(root, '.git', ARCHIVE_REF), 'corrupt\n');
            await expect(getArchiveTip(root, signal)).rejects.toThrow('Git for-each-ref failed');
            const aborted = new AbortController();
            aborted.abort(new Error('Stopped archive operation'));
            await expect(getArchiveTip(root, aborted.signal)).rejects.toThrow(
                'Stopped archive operation',
            );
        });
    },
);

Deno.test('archive history reports invalid metadata with its committed path', async () => {
    const idea = `${batch}/plans/invalid/IDEA.md`;
    const ticket = `${batch}/tickets/0001-invalid.md`;
    await withArchiveFixture(
        {
            [idea]: '---\ntitle: "Wrong status"\nstatus: "done"\n---\n',
            [ticket]: '---\ntitle: "  "\n---\n',
        },
        async (root) => {
            await expect(listArchivedPlans(root, batch, signal)).rejects.toThrow(
                `Invalid archived idea title or status: ${idea}`,
            );
            await expect(listArchivedTickets(root, batch, signal)).rejects.toThrow(
                `Invalid archived ticket title: ${ticket}`,
            );
        },
    );
    await withArchiveFixture({ [ticket]: '---\nid: "0001"\n---\n' }, async (root) => {
        await expect(listArchivedTickets(root, batch, signal)).rejects.toThrow(
            `Invalid archived ticket title: ${ticket}`,
        );
    });
});
