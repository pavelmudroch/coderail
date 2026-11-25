import { projectIgnoreLines } from '@project';
import { expect } from '@std/expect';
import { join } from '@std/path';
import { resolveTicket } from '@tickets';

import { Archive } from '../../src/commands/archive.ts';
import { Apply } from '../../src/commands/archive/apply.ts';
import { List } from '../../src/commands/archive/list.ts';
import { Plans } from '../../src/commands/archive/plans.ts';
import { Preview } from '../../src/commands/archive/preview.ts';
import { Read } from '../../src/commands/archive/read.ts';
import { Tickets } from '../../src/commands/archive/tickets.ts';
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
import { cli, cliOutput, crOutput, write } from './archive/fixtures.ts';

Deno.test('archive CLI shows help and reports argument errors without initialization', async () => {
    const root = await Deno.makeTempDir();
    try {
        const parentUsage = 'cr archive [--help] [--json] <command>';
        const cases = [
            {
                prefix: [],
                usage: parentUsage,
                invalid: [[], ['unknown'], ['--json=false'], ['--help=false']],
            },
            {
                prefix: ['preview'],
                usage: 'cr archive preview [--help] [--json]',
                invalid: [['extra'], ['--json=false']],
            },
            {
                prefix: ['apply'],
                usage: 'cr archive apply [--help] [--json] [--yes] <batch-name> <description>',
                invalid: [['name'], ['--yes=false']],
            },
            {
                prefix: ['list'],
                usage: 'cr archive list [--help] [--json]',
                invalid: [['extra'], ['--yes']],
            },
            {
                prefix: ['plans'],
                usage: 'cr archive plans [--help] [--json] <batch-id>',
                invalid: [[], [batch, 'extra']],
            },
            {
                prefix: ['tickets'],
                usage: 'cr archive tickets [--help] [--json] <batch-id>',
                invalid: [[], ['']],
            },
            {
                prefix: ['read'],
                usage: 'cr archive read [--help] [--json] <batch-id>/<path-to-file>',
                invalid: [[], ['--help=false']],
            },
        ];
        for (const { prefix, usage, invalid } of cases) {
            const [short, long] = await Promise.all([
                cli(root, ...prefix, '-h'),
                cli(root, ...prefix, '--help'),
            ]);
            expect(short).toEqual(long);
            expect(long).toMatchObject({ code: 0, stderr: '' });
            expect(long.stdout).toContain(`Usage:\n  ${usage}\n\n  `);
            expect(long.stdout).toContain('Options:\n  -h, --help');
            expect(long.stdout).toContain('--json');
            if (prefix.length === 0) {
                expect(long.stdout).toContain(
                    'Manage archive batches and archived files within the history branch.',
                );
                expect(long.stdout).toContain('Commands:\n');
            } else if (usage.includes('<')) {
                expect(long.stdout).toContain('Arguments:\n');
            }
            for (const result of await Promise.all(
                invalid.map((args) => cli(root, ...prefix, ...args)),
            )) {
                expect(result.code).toBe(2);
                expect(result.stderr).toContain(`Usage:\n  ${usage}\n`);
            }
        }
        for (const args of [['preview'], ['apply', '--yes', 'name', 'Description']]) {
            const result = await cli(root, ...args);
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('No initialized project found');
        }
        await expect(Deno.lstat(join(root, '.coderail'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('archive requires a known subcommand and forwards leaf options', async () => {
    const archive = new Archive();
    expect(archive.requiresInit).toBe(false);
    expect(archive.getUsage()).toContain('cr archive [--help] [--json] <command>');
    for (const [name, command] of Object.entries({
        preview: Preview,
        apply: Apply,
        list: List,
        plans: Plans,
        tickets: Tickets,
        read: Read,
    })) {
        const parsed = archive.parseArguments(['--json', name, '--help']);
        expect(parsed).toEqual({
            args: { help: false, command: name },
            rest: ['--json', '--help'],
        });
        expect(archive.getSubcommand(parsed)).toBeInstanceOf(command);
    }
    expect(archive.parseArguments(['--json', '--', 'read', '--', 'path'])).toEqual({
        args: { help: false, command: 'read' },
        rest: ['--json', '--', 'path'],
    });
    expect(archive.parseArguments(['--json'])).toEqual({ args: { help: false }, rest: ['--json'] });
    for (const flag of ['-h', '--help']) {
        const parsed = archive.parseArguments(['--json', flag, 'ignored']);
        expect(parsed).toEqual({ args: { help: true }, rest: ['--json'] });
        expect(archive.shouldHandleHelp(parsed)).toBe(true);
    }
    for (const [flag, message] of [
        ['--unknown', 'Unknown option "--unknown".'],
        ['--help=false', 'Option "--help" does not take a value.'],
        ['--json=', 'Option "--json" does not take a value.'],
    ] as const) {
        expect(() => archive.parseArguments([flag])).toThrow(message);
    }
    for (const args of [[], ['--json'], ['--']]) {
        const parsed = archive.parseArguments(args);
        expect(archive.shouldHandleHelp(parsed)).toBe(false);
        expect(() => archive.getSubcommand(parsed)).toThrow(
            'Required archive subcommand is missing.',
        );
    }
    for (const args of [['unknown'], ['--', '--help']]) {
        expect(() => archive.getSubcommand(archive.parseArguments(args))).toThrow(
            `Unknown archive subcommand "${args.at(-1)}".`,
        );
    }
    expect(await archive.run()).toBeUndefined();
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
            const leadingJsonPlans = await cli(subdirectory, '--json', '--', 'plans', '--', batch);
            expect(leadingJsonPlans).toMatchObject({ code: 0, stdout: plans.stdout });
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
            const trailingJsonTickets = await cli(subdirectory, 'tickets', batch, '--json');
            expect(trailingJsonTickets).toMatchObject({ code: 0, stdout: tickets.stdout });
            for (const args of [
                ['--json', 'read', artifactPath],
                ['read', artifactPath, '--json'],
            ]) {
                const raw = await cliOutput(subdirectory, ...args);
                expect(raw.code).toBe(0);
                expect(raw.stdout).toEqual(rawFile);
            }
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
