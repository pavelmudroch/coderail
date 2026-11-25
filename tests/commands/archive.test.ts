import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { dirname, fromFileUrl, join } from '@std/path';
import { resolveTicket } from '@tickets';

import { ARCHIVE_REF } from '../../src/archive/history.ts';
import { Apply, Archive, BrowseArchive, Preview } from '../../src/commands/archive.ts';
import {
    archiveFiles,
    artifactPath,
    batch,
    expectedPlans,
    fixtureGit,
    rawFile,
    ticketPath,
    withArchiveFixture,
} from '../archive/fixtures.ts';
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
    const result = await cliOutput(root, ...args);
    const decoder = new TextDecoder();
    return {
        code: result.code,
        stdout: decoder.decode(result.stdout),
        stderr: decoder.decode(result.stderr),
    };
}

function cliOutput(root: string, ...args: string[]): Promise<Deno.CommandOutput> {
    return crOutput(root, 'archive', ...args);
}

function crOutput(root: string, ...args: string[]): Promise<Deno.CommandOutput> {
    return new Deno.Command(Deno.execPath(), {
        cwd: root,
        args: ['run', '-A', main, '--no-color', ...args],
    }).output();
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
    expect(archive.getSubcommand(archive.parseArguments(['apply']))).toBeInstanceOf(Apply);
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

Deno.test('archive apply parses approval, JSON, and positional arguments', () => {
    const apply = new Apply();
    expect(apply.requiresInit).toBe(true);
    expect(apply.getSubcommand()).toBeUndefined();
    expect(apply.getUsage()).toContain('cr archive apply');
    for (const flag of ['-h', '--help']) {
        expect(apply.shouldHandleHelp(apply.parseArguments([flag, 'ignored']))).toBe(true);
    }
    expect(apply.shouldHandleHelp(apply.parseArguments(['name', 'description']))).toBe(false);
    expect(
        apply.parseArguments(['--json', '--yes', '--', 'first-batch', '--quoted description']),
    ).toEqual({
        args: {
            help: false,
            json: true,
            yes: true,
            name: 'first-batch',
            description: '--quoted description',
        },
        rest: [],
    });
    for (const args of [[], ['name'], ['name', 'description', 'extra']]) {
        expect(() => apply.parseArguments(args)).toThrow('requires a batch name and a description');
    }
    expect(() => apply.parseArguments(['--force', 'name', 'description'])).toThrow(
        'Unknown archive apply option',
    );
});

Deno.test(
    'closed tickets stay readable and reopenable until apply, and cleanup allows highest ID reuse',
    async () => {
        const root = await Deno.makeTempDir();
        const closed = '.coderail/tickets/closed/0002-old.md';
        const opened = '.coderail/tickets/open/0002-old.md';
        try {
            await fixtureGit(root, 'init', '-q');
            await fixtureGit(root, 'config', 'user.name', 'Archive Tests');
            await fixtureGit(root, 'config', 'user.email', 'archive@example.test');
            await write(root, '.coderail/.gitignore', projectIgnoreLines.join('\n') + '\n');
            const dates =
                'created_at: "2026-01-01T00:00:00Z"\nupdated_at: "2026-01-01T00:00:00Z"\n';
            await write(
                root,
                closed,
                `---\nid: "0002"\nslug: "old"\ntitle: "Old"\nstatus: "closed"\nreason: "done"\n${dates}---\n`,
            );
            await write(
                root,
                '.coderail/tickets/open/0001-first.md',
                `---\nid: "0001"\nslug: "first"\ntitle: "First"\nstatus: "open"\n${dates}---\n`,
            );
            await fixtureGit(root, 'add', '.');
            await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Tickets before archiving');
            expect((await resolveTicket(root, '0002')).status).toBe('closed');
            expect((await crOutput(root, 'ticket', 'reopen', '0002')).success).toBe(true);
            expect((await Deno.stat(join(root, opened))).isFile).toBe(true);
            expect((await crOutput(root, 'ticket', 'close', '--reason=done', '0002')).success).toBe(
                true,
            );
            await fixtureGit(root, 'add', '--', closed);
            await fixtureGit(root, 'commit', '--no-gpg-sign', '-qm', 'Finish reopened ticket');
            expect(
                (await cli(root, 'apply', '--yes', 'id-reuse', 'Closed ticket history')).code,
            ).toBe(0);
            await expect(resolveTicket(root, '0002')).rejects.toThrow();
            expect((await crOutput(root, 'ticket', 'create', 'Reuse')).success).toBe(true);
            expect((await resolveTicket(root, '0002')).title).toBe('Reuse');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

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
            expect((await cli(root, 'read', `${batchId}/plans/an-idea/IDEA.md`)).stdout).toBe(idea);
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

Deno.test('archive browsing parses command usage and required arguments', () => {
    const archive = new Archive();
    for (const command of ['list', 'plans', 'tickets', 'read'] as const) {
        expect(archive.getUsage()).toContain(`  ${command} `);
        const parsed = archive.parseArguments(['--json', command]);
        expect(archive.getSubcommand(parsed)).toBeInstanceOf(BrowseArchive);
        const browse = new BrowseArchive(command);
        expect(browse.requiresInit).toBe(false);
        expect(browse.getSubcommand()).toBeUndefined();
        expect(browse.getUsage()).toContain(`cr archive ${command} [--help]`);
        const defaultArgs = command === 'list' ? [] : [batch];
        expect(browse.parseArguments(defaultArgs).args.json).toBe(false);
        expect(browse.parseArguments(['--json', ...defaultArgs])).toEqual({
            args: { help: false, json: true, target: defaultArgs[0] ?? '' },
            rest: [],
        });
        expect(browse.shouldHandleHelp(browse.parseArguments(defaultArgs))).toBe(false);
        for (const help of ['--help', '-h']) {
            expect(browse.shouldHandleHelp(browse.parseArguments([help, 'ignored']))).toBe(true);
        }
        expect(() => browse.parseArguments(['--unknown'])).toThrow(
            `Unexpected archive ${command} argument "--unknown".`,
        );
    }
    expect(() => new BrowseArchive('list').parseArguments(['extra'])).toThrow(
        'Unexpected archive list argument "extra".',
    );
    expect(() => new BrowseArchive('plans').parseArguments([batch, 'extra'])).toThrow(
        'Unexpected archive plans argument "extra".',
    );
    expect(() => new BrowseArchive('plans').parseArguments(['', batch])).toThrow(
        'Unexpected archive plans argument "".',
    );
    expect(() => new BrowseArchive('plans').parseArguments([])).toThrow(
        'Archive plans requires a batch ID.',
    );
    expect(() => new BrowseArchive('read').parseArguments([])).toThrow(
        'Archive read requires an archived file path.',
    );
});

Deno.test('archive browse commands format listings and emit raw bytes in-process', async () => {
    await withArchiveFixture(archiveFiles, async (root) => {
        const context = { currentWorkingDirectory: root, installRoot: root };
        const runBrowse = (
            command: BrowseArchive,
            args: string[],
            repositoryRoot?: string,
        ): Promise<void> =>
            command.run({
                context: { ...context, repositoryRoot },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: true,
                    verify: { rules: [] },
                },
                signal: new AbortController().signal,
                parsedArguments: command.parseArguments(args),
            });
        using captured = captureOutput();
        const outputAfter = async (command: BrowseArchive, ...args: string[]): Promise<string> => {
            captured.stdout.length = 0;
            await runBrowse(command, args);
            const stdout = captured.stdout.join('');
            return args.includes('--json') ? stdout : stdout.replaceAll('\x1b[0K', '');
        };
        const list = new BrowseArchive('list');
        const plans = new BrowseArchive('plans');
        const tickets = new BrowseArchive('tickets');
        expect(await outputAfter(list)).toBe(
            '2026-11-25_alpha\n2026-11-25_zulu\n2026-11-24_previous\n',
        );
        expect(JSON.parse(await outputAfter(list, '--json'))).toEqual([
            batch,
            '2026-11-25_zulu',
            '2026-11-24_previous',
        ]);
        expect(await outputAfter(plans, batch)).toBe(
            expectedPlans
                .map(({ title, parent, path, artifacts }) =>
                    [
                        `${title}  ${path}`,
                        ...(parent === null ? [] : [`  Parent: ${parent}`]),
                        ...artifacts.map((artifact) => `  ${artifact}`),
                    ].join('\n'),
                )
                .join('\n') + '\n',
        );
        expect(await outputAfter(plans, '2026-11-25_zulu')).toContain('No archived plans');
        expect(JSON.parse(await outputAfter(plans, batch, '--json'))).toEqual(expectedPlans);
        expect(await outputAfter(tickets, batch)).toBe(
            `0009  Small ticket  ${ticketPath}\n` +
                `9999  Last four digits  ${batch}/tickets/9999-last-four.md\n` +
                `10000  Large ticket  ${batch}/tickets/10000-large.md\n`,
        );
        expect(await outputAfter(tickets, '2026-11-25_zulu')).toContain('No archived tickets');
        expect(JSON.parse(await outputAfter(tickets, batch, '--json'))[0]).toEqual({
            id: '0009',
            title: 'Small ticket',
            path: ticketPath,
        });
        const bytes: number[] = [];
        const original = Deno.stdout.writeSync;
        Deno.stdout.writeSync = (buffer): number => {
            bytes.push(...buffer);
            return buffer.length;
        };
        try {
            await runBrowse(
                new BrowseArchive('read'),
                ['--json', artifactPath],
                join(root, 'ignored'),
            );
            expect(new Uint8Array(bytes)).toEqual(rawFile);
        } finally {
            Deno.stdout.writeSync = original;
        }
        await fixtureGit(root, 'update-ref', '-d', 'refs/heads/coderail/archive-history');
        expect(await outputAfter(list)).toBe('No archive batches.\n');
    });
});

Deno.test(
    'archive browse CLI passes listing paths to byte-exact reads without affecting source state',
    async () => {
        await withArchiveFixture(archiveFiles, async (root) => {
            const subdirectory = join(root, 'subdirectory');
            await Deno.mkdir(subdirectory);
            await Deno.writeTextFile(join(root, 'README.md'), 'edited source checkout');
            await Deno.writeTextFile(join(root, 'new.txt'), 'staged source change');
            await fixtureGit(root, 'add', 'new.txt');
            const index = await Deno.readFile(join(root, '.git', 'index'));
            const refs = await fixtureGit(root, 'show-ref');
            const branch = await fixtureGit(root, 'symbolic-ref', 'HEAD');
            const status = await fixtureGit(root, 'status', '--short', '-uall');
            const listings = await cli(subdirectory, '--json', 'list');
            expect(listings.code).toBe(0);
            expect(JSON.parse(listings.stdout)).toEqual([
                batch,
                '2026-11-25_zulu',
                '2026-11-24_previous',
            ]);
            const plans = await cli(root, 'plans', batch, '--json');
            expect(plans.code).toBe(0);
            expect(JSON.parse(plans.stdout)).toEqual(expectedPlans);
            const humanPlans = await cli(root, 'plans', batch);
            expect(humanPlans.code).toBe(0);
            expect(humanPlans.stdout).toContain(`  Parent: ${batch}/plans/parent/IDEA.md\n`);
            const tickets = await cli(root, '--json', 'tickets', batch);
            expect(tickets.code).toBe(0);
            expect(JSON.parse(tickets.stdout)[0]).toEqual({
                id: '0009',
                title: 'Small ticket',
                path: ticketPath,
            });
            const humanTickets = await cli(root, 'tickets', batch);
            expect(humanTickets.code).toBe(0);
            expect(humanTickets.stdout).toContain(`0009  Small ticket  ${ticketPath}\n`);
            const paths: string[] = [
                `${JSON.parse(listings.stdout)[0]}/README.md`,
                ...JSON.parse(plans.stdout).flatMap((plan: (typeof expectedPlans)[number]) => [
                    plan.path,
                    ...plan.artifacts,
                ]),
                ...JSON.parse(tickets.stdout).map((ticket: { path: string }) => ticket.path),
            ];
            const reads = await Promise.all(paths.map((path) => cliOutput(root, 'read', path)));
            for (const [index, result] of reads.entries()) {
                expect(result.code).toBe(0);
                expect(result.stderr).toEqual(new Uint8Array());
                const content = archiveFiles[paths[index] as keyof typeof archiveFiles];
                expect(result.stdout).toEqual(
                    typeof content === 'string' ? new TextEncoder().encode(content) : content,
                );
            }
            const errors = await Promise.all([
                cli(root, 'read', '2026-11-24_missing/README.md'),
                cli(root, 'read', `${batch}/missing.md`),
                cli(root, 'read', `${batch}/plans`),
                cli(root, 'read', `${batch}/../README.md`),
            ]);
            for (const [index, message] of [
                'Unknown archive batch',
                'was not found',
                'is a directory',
                'must stay within one batch',
            ].entries()) {
                expect(errors[index]?.code).toBe(1);
                expect(errors[index]?.stdout).toBe('');
                expect(errors[index]?.stderr).toContain(message);
            }
            expect(await fixtureGit(root, 'show-ref')).toBe(refs);
            expect(await fixtureGit(root, 'symbolic-ref', 'HEAD')).toBe(branch);
            expect(await Deno.readFile(join(root, '.git', 'index'))).toEqual(index);
            expect(await fixtureGit(root, 'status', '--short', '-uall')).toBe(status);
            expect(await Deno.readTextFile(join(root, 'README.md'))).toBe('edited source checkout');
            expect(await Deno.readTextFile(join(root, 'new.txt'))).toBe('staged source change');
            await fixtureGit(root, 'update-ref', '-d', 'refs/heads/coderail/archive-history');
            expect(await cli(root, 'list', '--json')).toMatchObject({ code: 0, stdout: '[]\n' });
        });
    },
);

Deno.test(
    'archive browsing discovers the Git repository from the command working directory',
    async () => {
        await withArchiveFixture(archiveFiles, async (root) => {
            await Deno.mkdir(join(root, '.coderail'));
            const nested = join(root, 'nested');
            await Deno.mkdir(nested);
            await fixtureGit(nested, 'init', '-q');
            const nestedDirectory = join(nested, 'subdirectory');
            await Deno.mkdir(nestedDirectory);

            const outer = await cli(root, '--json', 'list');
            expect(outer.code).toBe(0);
            expect(JSON.parse(outer.stdout)).toContain(batch);

            const inner = await cli(nestedDirectory, '--json', 'list');
            expect(inner.code).toBe(0);
            expect(JSON.parse(inner.stdout)).toEqual([]);
            const missing = await cli(nestedDirectory, 'read', `${batch}/README.md`);
            expect(missing).toMatchObject({ code: 1, stdout: '' });
            expect(missing.stderr).toContain(`Unknown archive batch "${batch}"`);
        });
    },
);
