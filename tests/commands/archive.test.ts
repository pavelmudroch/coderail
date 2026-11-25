import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { dirname, fromFileUrl, join } from '@std/path';

import { Archive, Preview } from '../../src/commands/archive.ts';
import { captureOutput } from '../log/helpers.ts';

const main = fromFileUrl(new URL('../../src/main.ts', import.meta.url));

async function git(root: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', { cwd: root, args }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout).trim();
}

async function cli(
    root: string,
    ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
    const result = await new Deno.Command(Deno.execPath(), {
        cwd: root,
        args: ['run', '-A', main, '--no-color', 'archive', ...args],
    }).output();
    const decode = (buffer: Uint8Array): string =>
        new TextDecoder().decode(buffer).replaceAll('\x1b[0K', '');
    return { code: result.code, stdout: decode(result.stdout), stderr: decode(result.stderr) };
}

async function write(root: string, path: string, text: string): Promise<void> {
    const filename = join(root, path);
    await Deno.mkdir(dirname(filename), { recursive: true });
    await Deno.writeTextFile(filename, text);
}

Deno.test('archive resolves preview and handles argument errors and help', async () => {
    const archive = new Archive();
    expect(archive.requiresInit).toBe(false);
    expect(archive.getUsage()).toContain('cr archive [--help] [--json] <command>');
    expect(archive.shouldHandleHelp(archive.parseArguments([]))).toBe(false);
    expect(archive.parseArguments(['--json'])).toEqual({ args: { help: false }, rest: ['--json'] });
    expect(archive.getSubcommand(archive.parseArguments(['preview']))).toBeInstanceOf(Preview);
    expect(archive.parseArguments(['--json', 'preview', '--help']).rest).toEqual([
        '--json',
        '--help',
    ]);
    for (const flag of ['-h', '--help']) {
        expect(archive.shouldHandleHelp(archive.parseArguments([flag, 'ignored']))).toBe(true);
    }
    expect(() => archive.parseArguments(['--unknown'])).toThrow('Unknown option "--unknown".');
    expect(() => archive.getSubcommand(archive.parseArguments([]))).toThrow(
        'Required archive subcommand is missing.',
    );
    expect(() => archive.getSubcommand(archive.parseArguments(['unknown']))).toThrow(
        'Unknown archive subcommand "unknown".',
    );
    expect(await archive.run()).toBeUndefined();

    const preview = new Preview();
    expect(preview.requiresInit).toBe(true);
    expect(preview.getSubcommand()).toBeUndefined();
    expect(preview.getUsage()).toContain('cr archive preview [--help] [--json]');
    expect(preview.parseArguments([])).toEqual({ args: { help: false, json: false }, rest: [] });
    expect(preview.parseArguments(['--json']).args.json).toBe(true);
    for (const flag of ['-h', '--help']) {
        expect(preview.shouldHandleHelp(preview.parseArguments([flag, 'ignored']))).toBe(true);
    }
    expect(() => preview.parseArguments(['too-many'])).toThrow(
        'Unexpected archive preview argument "too-many".',
    );
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

            const human = await cli(root, 'preview');
            expect(human.code).toBe(0);
            expect(human.stdout).toContain(
                'Eligible groups: 1\n\n  .coderail/plans/first/IDEA.md\n\nDeferred groups: 1\n\n' +
                    '  .coderail/plans/second/IDEA.md\n    Referenced by retained Markdown: .coderail/plans/INDEX.md.',
            );
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
            expect(
                JSON.parse(captured.stdout.join('').replaceAll('\x1b[0K', '').trim()).deferred,
            ).toHaveLength(1);

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
