import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { ARCHIVE_REF, readArchivedFile } from '../../../src/archive/history.ts';
import { Apply } from '../../../src/commands/archive/apply.ts';
import { fixtureGit } from '../../archive/fixtures.ts';
import { captureOutput } from '../../log/helpers.ts';
import { cli, write } from './fixtures.ts';

Deno.test('archive apply parses approval, JSON, and positional arguments', () => {
    const apply = new Apply();
    expect(apply.requiresInit).toBe(true);
    expect(apply.getSubcommand()).toBeUndefined();
    expect(apply.getUsage()).toContain(
        'cr archive apply [--help] [--json] [--yes] <batch-name> <description>',
    );
    for (const flag of ['-h', '--help']) {
        expect(apply.shouldHandleHelp(apply.parseArguments([flag]))).toBe(true);
    }
    expect(apply.shouldHandleHelp(apply.parseArguments(['name', 'description']))).toBe(false);
    expect(
        apply.parseArguments(['--json', '--yes', '--', 'first-batch', '--quoted description']),
    ).toEqual({
        args: { help: false, json: true, yes: true },
        rest: ['first-batch', '--quoted description'],
    });
    expect(() => apply.parseArguments(['--yes=false'])).toThrow(
        'Option "--yes" does not take a value.',
    );
});

Deno.test('archive apply reports recovery coordinates even when interrupted', async () => {
    const root = await Deno.makeTempDir();
    const ideaPath = '.coderail/plans/an-idea/IDEA.md';
    const idea = '---\ntitle: "An idea"\nstatus: "archived"\n---\n';
    try {
        await fixtureGit(root, 'init', '-q');
        await fixtureGit(root, 'config', 'user.name', 'Archive Tests');
        await fixtureGit(root, 'config', 'user.email', 'archive@example.test');
        await write(root, ideaPath, idea);
        await write(root, '.coderail/plans/an-idea/notes.txt', 'Original notes');
        await fixtureGit(root, 'add', '.');
        await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Apply fixture');
        const command = new Apply();
        const controller = new AbortController();
        const remove = Deno.remove;
        Deno.remove = async (path, options) => {
            await remove(path, options);
            if (path === join(root, ideaPath)) {
                controller.abort();
            }
        };
        using captured = captureOutput();
        try {
            await expect(
                command.run({
                    context: { currentWorkingDirectory: root, installRoot: root },
                    configuration: {
                        logLevel: 'normal',
                        noColor: true,
                        nonInteractive: true,
                        verify: { rules: [] },
                    },
                    signal: controller.signal,
                    parsedArguments: command.parseArguments([
                        '--yes',
                        'interrupted',
                        'Description',
                    ]),
                }),
            ).rejects.toThrow('Archive source removal failed');
        } finally {
            Deno.remove = remove;
        }
        expect(captured.stderr.join('')).toMatch(
            /Rollback succeeded.*Batch: .*_interrupted.*Source commit: .*Archive commit: /s,
        );
        expect(await Deno.readTextFile(join(root, ideaPath))).toBe(idea);
        expect(await fixtureGit(root, 'for-each-ref', ARCHIVE_REF)).toBe('');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'archive apply CLI requires approval, emits valid JSON, and handles empty selections',
    async () => {
        const root = await Deno.makeTempDir();
        const ideaPath = '.coderail/plans/an-idea/IDEA.md';
        const idea = '---\ntitle: "An idea"\nstatus: "archived"\n---\n';
        try {
            await fixtureGit(root, 'init', '-q');
            await fixtureGit(root, 'config', 'user.name', 'Archive Tests');
            await fixtureGit(root, 'config', 'user.email', 'archive@example.test');
            await write(root, '.coderail/.gitignore', projectIgnoreLines.join('\n') + '\n');
            await fixtureGit(root, 'add', '.');
            await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Empty fixture');
            const emptyJson = await cli(root, 'apply', '--json', '--yes', 'empty', 'No work');
            expect(emptyJson.code).toBe(0);
            expect(JSON.parse(emptyJson.stdout)).toMatchObject({ status: 'empty' });
            const empty = await cli(root, 'apply', '--yes', 'empty', 'No work');
            expect(empty.code).toBe(0);
            expect(empty.stdout).toContain('No eligible files to archive.');
            await write(root, ideaPath, idea);
            await fixtureGit(root, 'add', '.');
            await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Apply fixture');
            const sourceCommit = await fixtureGit(root, 'rev-parse', 'HEAD');
            const index = await Deno.readFile(join(root, '.git/index'));
            const denied = await cli(root, '--json', 'apply', 'test', 'Description');
            expect(denied.code).toBe(1);
            expect(denied.stderr).toContain('Pause source edits and ticket or plan updates');
            expect(denied.stderr).toContain('use --yes after approval');
            expect(denied.stdout).toBe('');

            const nested = join(root, 'nested-checkout');
            await Deno.mkdir(nested);
            await fixtureGit(nested, 'init', '-q');
            const wrongCheckout = await cli(
                nested,
                'apply',
                '--yes',
                'wrong-checkout',
                'Description',
            );
            expect(wrongCheckout.code).toBe(1);
            expect(wrongCheckout.stderr).toContain('current Git checkout does not contain');

            const command = new Apply();
            const currentWorkingDirectory = join(root, '.coderail');
            const context = { currentWorkingDirectory, repositoryRoot: root, installRoot: root };
            const configuration = {
                logLevel: 'normal' as const,
                noColor: true,
                nonInteractive: false,
                verify: { rules: [] },
            };
            const signal = new AbortController().signal;
            const run = (args: string[]): Promise<void> =>
                command.run({
                    context,
                    configuration,
                    signal,
                    parsedArguments: command.parseArguments(args),
                });
            const captured = captureOutput();
            const readSync = Deno.stdin.readSync;
            Deno.stdin.readSync = (buffer): number => {
                buffer.set([10]);
                return 1;
            };
            try {
                await run(['test', 'Description']);
                expect(captured.stderr.join('')).toContain('eligible archive files? [y/N]');
                expect(captured.stdout.join('')).toContain('Archive apply declined.');
                await expect(
                    command.run({
                        context,
                        configuration: { ...configuration, nonInteractive: true },
                        signal,
                        parsedArguments: command.parseArguments(['test', 'Description']),
                    }),
                ).rejects.toThrow('use --yes after approval');
            } finally {
                Deno.stdin.readSync = readSync;
                captured[Symbol.dispose]();
            }
            expect(await fixtureGit(root, 'for-each-ref', ARCHIVE_REF)).toBe('');
            expect(await Deno.readTextFile(join(root, ideaPath))).toBe(idea);
            expect(await Deno.readFile(join(root, '.git/index'))).toEqual(index);

            const applied = await cli(root, '--json', 'apply', '--yes', 'test', 'Description');
            expect(applied.code).toBe(0);
            expect(applied.stderr).toContain('Pause source edits and ticket or plan updates');
            const batchId = `${new Date().toISOString().slice(0, 10)}_test`;
            const archiveCommit = await fixtureGit(root, 'rev-parse', ARCHIVE_REF);
            expect(JSON.parse(applied.stdout)).toEqual({
                status: 'applied',
                sourceCommit,
                batchId,
                archiveCommit,
                paths: [ideaPath],
            });
            expect(
                new TextDecoder().decode(
                    await readArchivedFile(root, `${batchId}/plans/an-idea/IDEA.md`, signal),
                ),
            ).toBe(idea);
            await expect(Deno.lstat(join(root, ideaPath))).rejects.toBeInstanceOf(
                Deno.errors.NotFound,
            );
            expect(await Deno.readFile(join(root, '.git/index'))).toEqual(index);
            expect(await fixtureGit(root, 'rev-parse', 'HEAD')).toBe(sourceCommit);

            await write(root, ideaPath, idea);
            using humanOutput = captureOutput();
            await run(['--yes', 'second', 'Description']);
            expect(humanOutput.stdout.join('')).toMatch(
                /Recorded archive batch [\d-]+_second at [a-f\d]+\. Removed 1 source files\./,
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
