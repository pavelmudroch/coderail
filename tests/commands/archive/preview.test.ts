import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { Preview } from '../../../src/commands/archive/preview.ts';
import { captureOutput } from '../../log/helpers.ts';
import { cli, git, write } from './fixtures.ts';

Deno.test('archive preview supports help and accepts no positional arguments', () => {
    const preview = new Preview();
    expect(preview.requiresInit).toBe(true);
    expect(preview.getSubcommand()).toBeUndefined();
    expect(preview.getUsage()).toContain('cr archive preview [--help] [--json]');
    expect(preview.parseArguments([])).toEqual({
        args: { help: false, json: false, yes: false },
        rest: [],
    });
    expect(preview.shouldHandleHelp(preview.parseArguments([]))).toBe(false);
    expect(preview.shouldHandleHelp(preview.parseArguments(['--help']))).toBe(true);
    expect(() => preview.parseArguments(['extra'])).toThrow('Too many arguments.');
});

Deno.test(
    'archive preview CLI emits empty, grouped and deferred results and leaves source state alone',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            await git(root, 'init', '-q');
            await write(root, '.coderail/.gitignore', projectIgnoreLines.join('\n') + '\n');
            await git(root, 'add', '.');
            const commit = (): Promise<string> =>
                git(
                    root,
                    '-c',
                    'user.name=Archive Tests',
                    '-c',
                    'user.email=archive@example.test',
                    'commit',
                    '--no-gpg-sign',
                    '-qm',
                    'Fixture',
                );
            await commit();
            const empty = await cli(root, '--json', 'preview');
            expect(empty.code).toBe(0);
            expect(JSON.parse(empty.stdout)).toEqual({
                sourceCommit: await git(root, 'rev-parse', 'HEAD'),
                eligible: [],
                deferred: [],
            });

            const idea = '---\ntitle: "Old plan"\nstatus: "archived"\n---\n';
            await write(root, '.coderail/plans/first/IDEA.md', idea);
            await write(root, '.coderail/plans/second/IDEA.md', idea);
            const retained = '.coderail/plans/INDEX.md';
            await write(root, retained, '[Active reference](second/IDEA.md)\n');
            await git(root, 'add', '.');
            await commit();

            const human = await cli(join(root, '.coderail', 'plans'), 'preview');
            expect(human.code).toBe(0);
            expect(human.stdout).toContain(
                'Eligible groups: 1\n\n  .coderail/plans/first/IDEA.md\n\nDeferred groups: 1\n\n' +
                    '  .coderail/plans/second/IDEA.md\n    Referenced by retained Markdown: .coderail/plans/INDEX.md.',
            );
            const grouped = await cli(root, 'preview', '--json');
            expect(grouped.code).toBe(0);
            expect(JSON.parse(grouped.stdout).eligible).toHaveLength(1);
            expect(JSON.parse(grouped.stdout).deferred).toHaveLength(1);
            const preview = new Preview();
            const context = { currentWorkingDirectory: root, installRoot: root };
            const configuration = {
                logLevel: 'normal' as const,
                noColor: true,
                nonInteractive: true,
                verify: { rules: [] },
            };
            using captured = captureOutput();
            for (const flags of [[], ['--json']]) {
                captured.stdout.length = 0;
                await preview.run({
                    context,
                    configuration,
                    signal: new AbortController().signal,
                    parsedArguments: preview.parseArguments(flags),
                });
                expect(captured.stdout.join('')).toContain('.coderail/plans/first/IDEA.md');
                expect(captured.stdout.join('')).toContain('.coderail/plans/second/IDEA.md');
            }
            captured.stdout.length = 0;
            await preview.run({
                context: {
                    ...context,
                    currentWorkingDirectory: join(root, 'ignored'),
                    repositoryRoot: root,
                },
                configuration,
                signal: new AbortController().signal,
                parsedArguments: preview.parseArguments(['--json']),
            });
            expect(JSON.parse(captured.stdout.join('')).deferred).toHaveLength(1);

            const bad = '[Broken reference](second/missing.md)\n';
            await write(root, retained, bad);
            const refs = await git(root, 'show-ref');
            const index = await Deno.readFile(join(root, '.git', 'index'));
            const failure = await cli(root, 'preview', '--json');
            expect(failure.code).toBe(1);
            expect(failure.stdout).toBe('');
            expect(failure.stderr).toContain(
                'Stale archive link in ".coderail/plans/INDEX.md": "second/missing.md"',
            );
            expect(await git(root, 'show-ref')).toBe(refs);
            expect(await Deno.readFile(join(root, '.git', 'index'))).toEqual(index);
            expect(await Deno.readTextFile(join(root, retained))).toBe(bad);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
