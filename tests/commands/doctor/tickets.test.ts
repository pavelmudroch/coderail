import { Conf } from '@conf';
import { Fs } from '@fs';
import { Log } from '@log';
import { expect } from '@std/expect';
import { join, relative } from '@std/path';
import { withTicketLock } from '@tickets';

import { runRepairs } from '../../../src/commands/doctor/repairs.ts';
import { Tickets } from '../../../src/commands/doctor/tickets.ts';
import type { DoctorFailure, DoctorRepair } from '../../../src/commands/doctor/types.ts';
import { Activate } from '../../../src/commands/ticket/activate.ts';
import { type Frontmatter, stringifyFrontmatter } from '../../../src/md/helpers/frontmatter.ts';

const signal = new AbortController().signal;
const metadata: Frontmatter = {
    id: '0012',
    slug: 'custom-title',
    title: 'Custom title',
    status: 'open',
    created_at: '2026-11-12T00:00:00Z',
    updated_at: '2026-11-12T00:00:00Z',
    dependencies: [],
};
async function write(root: string, name: string, fields: Frontmatter = metadata): Promise<string> {
    const path = join(root, '.coderail/tickets', name);
    await Deno.mkdir(join(path, '..'), { recursive: true });
    await Deno.writeTextFile(path, `---\n${stringifyFrontmatter(fields)}\n---\nCustom body  \r\n`);
    return path;
}

function detail(finding: DoctorFailure | undefined, label: string): string | undefined {
    return finding?.details?.find((field) => field.label === label)?.value;
}

function findingText(finding: DoctorFailure): string {
    return [
        finding.message,
        ...(finding.details ?? []).map(({ label, value }) => `${label}: ${value}`),
    ].join('\n');
}

Deno.test(
    'tickets accept healthy metadata, optional dependencies and all closure reasons',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const absent = await Tickets.check(root, signal);
            expect(absent.failures).toEqual([]);
            expect(absent.skipped).toHaveLength(3);
            for (const id of ['12345', '0001']) {
                await write(root, `closed/${id}-custom-title.md`, {
                    ...metadata,
                    id,
                    status: 'closed',
                    reason: 'done',
                });
            }
            for (const status of ['open', 'active', 'closed']) {
                for (const reason of status === 'closed'
                    ? ['done', 'dismissed', 'duplicate']
                    : [undefined]) {
                    await write(root, `${status}/0012-custom-title.md`, {
                        ...metadata,
                        status,
                        reason,
                        dependencies: undefined,
                        'duplicate-of': reason === 'duplicate' ? '12345' : undefined,
                    });
                    expect((await Tickets.check(root, signal)).failures).toEqual([]);
                }
                await Deno.remove(join(root, '.coderail/tickets', status, '0012-custom-title.md'));
            }
            await write(root, 'open/0012-custom-title.md', {
                ...metadata,
                dependencies: ['12345', '0001'],
            });
            expect((await Tickets.check(root, signal)).failures).toEqual([]);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets diagnose fields independently without deriving metadata from filenames',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            for (const [field, value] of [
                ['id', undefined],
                ['id', 12],
                ['id', '12'],
                ['id', 'bad'],
                ['slug', undefined],
                ['slug', true],
                ['slug', ''],
                ['slug', '../escape'],
                ['title', undefined],
                ['title', 5],
                ['title', ' '],
                ['title', '///'],
                ['slug', 'different'],
                ['status', undefined],
                ['status', 5],
                ['status', 'pending'],
                ['dependencies', true],
                ['dependencies', [12]],
                ['dependencies', ['12']],
                ['created_at', undefined],
                ['created_at', 12],
                ['updated_at', ' '],
                ['reason', 'done'],
                ['duplicate-of', '0001'],
            ] as [string, Frontmatter[string]][]) {
                const path = await write(root, 'open/0012-custom-title.md', {
                    ...metadata,
                    [field]: value,
                });
                const report = await Tickets.check(root, signal);
                expect(
                    report.failures.some((finding) => finding.message.includes(field)),
                    `${field}=${value}`,
                ).toBe(true);
                expect(
                    report.failures.every(
                        (finding) =>
                            !finding.repairable &&
                            !finding.repair &&
                            finding.manualRepair.length > 0,
                    ),
                ).toBe(true);
                expect(
                    report.failures.every(
                        (finding) => detail(finding, 'File') === relative(root, path),
                    ),
                ).toBe(true);
                expect(
                    report.failures.some((finding) => finding.message.includes('placement')),
                ).toBe(false);
            }
            for (const fields of [
                { reason: undefined },
                { reason: 'other' },
                { reason: 5 },
                { reason: 'duplicate' },
                { reason: 'duplicate', 'duplicate-of': 12 },
                { reason: 'duplicate', 'duplicate-of': '12' },
                { reason: 'done', 'duplicate-of': '0001' },
            ]) {
                await write(root, 'open/0012-custom-title.md', {
                    ...metadata,
                    status: 'closed',
                    ...fields,
                });
                expect(
                    (await Tickets.check(root, signal)).failures.some((finding) =>
                        /reason|duplicate-of/.test(finding.message),
                    ),
                ).toBe(true);
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets use metadata identity for duplicates and expected placement while preserving bytes',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const first = await write(root, 'closed/unrelated.txt');
            const second = await write(root, 'active/9999-another.md', {
                ...metadata,
                title: 'Changed title',
            });
            const originals = await Promise.all([first, second].map((path) => Deno.readFile(path)));
            const report = await Tickets.check(root, signal);
            const messages = report.failures.map(findingText).join('\n');
            expect(messages).toContain('Invalid ticket filename');
            expect(messages).toContain('.coderail/tickets/open/0012-custom-title.md');
            expect(messages).toContain(
                'Duplicate ticket ID\nDirectory: .coderail/tickets\nTicket: 0012',
            );
            expect(messages).toContain(relative(root, first));
            expect(messages).toContain(relative(root, second));
            expect(messages).not.toContain('Ticket: 9999');
            expect(messages).toContain('title/slug');
            expect(report.failures.every((finding) => !finding.repairable && !finding.repair)).toBe(
                true,
            );
            expect(await Promise.all([first, second].map((path) => Deno.readFile(path)))).toEqual(
                originals,
            );
            await write(root, 'closed/unrelated.txt', { ...metadata, id: undefined });
            expect(
                (await Tickets.check(root, signal)).failures.some((finding) =>
                    finding.message.includes('Duplicate ticket ID'),
                ),
            ).toBe(false);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets tolerate malformed and unavailable files and directories beside independent findings',
    async () => {
        const root = await Deno.makeTempDir();
        const read = Deno.readFile;
        const readDir = Deno.readDir;
        try {
            const healthy = await write(root, 'open/0012-custom-title.md');
            const broken = await write(root, 'open/broken.md', {
                ...metadata,
                id: '0023',
                dependencies: false,
            });
            const unreadable = await write(root, 'open/unreadable.md');
            const malformed = await write(root, 'open/malformed.md');
            await Deno.mkdir(join(root, '.coderail/tickets/open/subdirectory'));
            await Deno.symlink(healthy, join(root, '.coderail/tickets/open/link.md'));
            Deno.readFile = (path, options) =>
                path === unreadable
                    ? Promise.reject(new Deno.errors.PermissionDenied('ticket denied'))
                    : read(path, options);
            Deno.readDir = (path) => {
                if (String(path).endsWith('/active')) {
                    throw new Deno.errors.PermissionDenied('directory denied');
                }
                return readDir(path);
            };
            for (const body of ['---\nid: [\n---\n', '---\nid: "0012"', 'body without metadata']) {
                await Deno.writeTextFile(malformed, body);
                const report = await Tickets.check(root, signal);
                const messages = report.failures.map(findingText).join('\n');
                for (const value of [
                    relative(root, broken),
                    relative(root, malformed),
                    relative(root, unreadable),
                    'ticket denied',
                    'directory denied',
                    'regular file',
                ]) {
                    expect(messages).toContain(value);
                }
                expect(messages).not.toContain(relative(root, healthy));
                expect(report.skipped.join(' ')).toContain('unavailable');
            }
        } finally {
            Deno.readFile = read;
            Deno.readDir = readDir;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets propagate cancellation before inventory and during file and directory failures',
    async () => {
        const root = await Deno.makeTempDir();
        const read = Deno.readFile;
        const readDir = Deno.readDir;
        try {
            await write(root, 'open/0012-custom-title.md');
            const already = AbortSignal.abort(new Error('cancelled before'));
            await expect(Tickets.check(root, already)).rejects.toThrow('cancelled before');
            const file = new AbortController();
            Deno.readFile = () => {
                file.abort(new Error('cancelled file'));
                return Promise.reject(new Error('read failure'));
            };
            await expect(Tickets.check(root, file.signal)).rejects.toThrow('cancelled file');
            Deno.readFile = read;
            const directory = new AbortController();
            Deno.readDir = () => {
                directory.abort(new Error('cancelled directory'));
                throw new Error('directory failure');
            };
            await expect(Tickets.check(root, directory.signal)).rejects.toThrow(
                'cancelled directory',
            );
        } finally {
            Deno.readFile = read;
            Deno.readDir = readDir;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets resolve references by metadata and report missing, ambiguous and unusable targets',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const source = await write(root, 'open/0012-custom-title.md', {
                ...metadata,
                dependencies: ['0020', '0030', '0040', '0050'],
            });
            const moved = await write(root, 'active/9999-wrong.md', {
                ...metadata,
                id: '0020',
                status: 'closed',
                reason: 'done',
            });
            const ambiguous = await write(root, 'open/0030-custom-title.md', {
                ...metadata,
                id: '0030',
            });
            await write(root, 'active/0030-custom-title.md', {
                ...metadata,
                id: '0030',
                status: 'active',
            });
            const unusable = await write(root, 'closed/0040-custom-title.md', {
                ...metadata,
                id: '0040',
                status: 'closed',
                reason: 'invalid',
            });
            const report = await Tickets.check(root, signal);
            const messages = report.failures.map(findingText).join('\n');
            for (const text of [
                'Ambiguous target "0030"',
                'Unusable target "0040"',
                'Missing target "0050"',
                relative(root, source),
                relative(root, ambiguous),
                relative(root, unusable),
            ]) {
                expect(messages).toContain(text);
            }
            expect(messages).toContain(relative(root, moved));
            expect(messages).not.toContain('Missing target "0020"');
            expect(messages).not.toContain('Chain: "0020"');
            expect(
                report.failures.filter((finding) =>
                    finding.message.includes('Blocked progression'),
                ),
            ).toHaveLength(3);
            expect(
                report.failures
                    .filter((finding) => !finding.message.includes('Incorrect placement'))
                    .every(
                        (finding) =>
                            !finding.repairable &&
                            !finding.repair &&
                            finding.manualRepair.length > 0,
                    ),
            ).toBe(true);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets distinguish historical integrity from readiness across dependency and duplicate chains',
    async () => {
        const root = await Deno.makeTempDir();
        const files = new Map<string, string>();
        async function ticket(id: string, fields: Frontmatter = {}): Promise<void> {
            const status = typeof fields.status === 'string' ? fields.status : 'open';
            const path = await write(root, `${status}/${id}-custom-title.md`, {
                ...metadata,
                id,
                ...fields,
            });
            files.set(path, await Deno.readTextFile(path));
        }
        try {
            await ticket('0001', { status: 'closed', reason: 'dismissed' });
            await ticket('0002', { dependencies: ['0001'] });
            await ticket('0003', { status: 'active', dependencies: ['0002'] });
            await ticket('0004', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0003' });
            await ticket('0005', { dependencies: ['0004'] });
            await ticket('0010', {
                status: 'closed',
                reason: 'done',
                dependencies: ['0011', '9999'],
            });
            await ticket('0011', { status: 'closed', reason: 'done', dependencies: ['0010'] });
            await ticket('0012', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0010' });
            await ticket('0013', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0012' });
            await ticket('0014', { dependencies: ['0013'] });
            await ticket('0020');
            await ticket('0021', { status: 'active', dependencies: ['0020'] });
            await ticket('0022', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0021' });
            await ticket('0023', { dependencies: ['0022'] });
            await ticket('0030', { dependencies: ['0031'] });
            await ticket('0031', { dependencies: ['0032'] });
            await ticket('0032', { dependencies: ['0030'] });
            await ticket('0033', { dependencies: ['0030'] });
            await ticket('0040', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0041' });
            await ticket('0041', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0040' });
            await ticket('0042', { dependencies: ['0040'] });
            await ticket('0050', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0051' });
            await ticket('0051', { dependencies: ['0050'] });
            await ticket('0060', { dependencies: ['0060'] });
            await ticket('0061', { status: 'closed', reason: 'duplicate', 'duplicate-of': '0061' });
            await ticket('0062', { status: 'closed', reason: 'duplicate', 'duplicate-of': '9998' });
            await ticket('0063', { dependencies: ['0062'] });
            await ticket('0064', { dependencies: ['0001'] });
            const report = await Tickets.check(root, signal);
            const blocked = report.failures.filter((finding) =>
                finding.message.includes('Blocked progression'),
            );
            for (const id of [
                '0002',
                '0003',
                '0005',
                '0030',
                '0031',
                '0032',
                '0033',
                '0042',
                '0051',
                '0060',
                '0063',
                '0064',
            ]) {
                expect(
                    blocked.some((finding) => detail(finding, 'Chain')?.startsWith(`"${id}"`)),
                    id,
                ).toBe(true);
            }
            expect(blocked).toHaveLength(12);
            const transitive = blocked.find((finding) =>
                detail(finding, 'Chain')?.startsWith('"0005"'),
            ) as DoctorFailure;
            expect(detail(transitive, 'Chain')).toMatch(
                /0005.* -> "0004".* -> "0003".* -> "0002".* -> "0001".*dismissed/,
            );
            const cycles = report.failures.filter(
                (finding) => finding.message === 'Ticket graph cycle',
            );
            for (const id of ['0010', '0030', '0040', '0050', '0060', '0061']) {
                expect(
                    cycles.some((finding) => detail(finding, 'Chain')?.includes(`"${id}"`)),
                    id,
                ).toBe(true);
            }
            expect(cycles).toHaveLength(6);
            const messages = report.failures.map(findingText).join('\n');
            expect(messages).toContain('Reference: dependency\nTarget: Missing target "9999"');
            expect(messages).toContain('Reference: duplicate-of\nTarget: Missing target "9998"');
            const selfReferences = report.failures.filter(
                ({ message }) => message === 'Ticket self-reference',
            );
            expect(selfReferences.map((finding) => detail(finding, 'Reference')).sort()).toEqual([
                'dependency',
                'duplicate-of',
            ]);
            expect(report.failures.every((finding) => !finding.repairable && !finding.repair)).toBe(
                true,
            );
            for (const [path, original] of files) {
                expect(await Deno.readTextFile(path)).toBe(original);
            }
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets avoid speculative identities when metadata is unavailable while retaining independent graph findings',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            await write(root, 'open/0012-custom-title.md', {
                ...metadata,
                dependencies: ['0020', '0030'],
            });
            const malformed = await write(root, 'closed/0020-custom-title.md');
            await Deno.writeTextFile(malformed, '---\nid: [\n---\n');
            await write(root, 'open/0030-custom-title.md', {
                ...metadata,
                id: '0030',
                dependencies: ['0030'],
            });
            const messages = (await Tickets.check(root, signal)).failures
                .map(findingText)
                .join('\n');
            expect(messages).toContain('Ticket metadata unavailable');
            expect(messages).toContain('Unavailable target "0020" (inventory incomplete)');
            expect(messages).not.toContain('Missing target "0020"');
            expect(messages).toContain('Ticket graph cycle');
            expect(messages).toContain('Chain: "0012"');
            await Deno.writeTextFile(malformed, 'body without frontmatter');
            const partial = (await Tickets.check(root, signal)).failures
                .map(findingText)
                .join('\n');
            expect(partial).toContain('Unavailable target "0020" (inventory incomplete)');
            expect(partial).not.toContain('Missing target "0020"');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

function actions(report: { failures: DoctorFailure[] }): DoctorRepair[] {
    return [
        ...new Map(
            report.failures.flatMap((failure) =>
                failure.repair ? [[failure.repair.key, failure.repair] as const] : [],
            ),
        ).values(),
    ];
}

Deno.test(
    'tickets relocate authoritative metadata to every status without changing bytes',
    async () => {
        for (const status of ['open', 'active', 'closed']) {
            const root = await Deno.makeTempDir();
            try {
                const source = await write(root, 'open/unrelated.txt', {
                    ...metadata,
                    id: '0042',
                    title: 'Fix parser',
                    slug: 'fix-parser',
                    status,
                    reason: status === 'closed' ? 'done' : undefined,
                });
                const destination = join(root, '.coderail/tickets', status, '0042-fix-parser.md');
                const bytes = await Deno.readFile(source);
                const report = await Tickets.check(root, signal);
                expect(await Deno.readFile(source)).toEqual(bytes);
                await expect(Deno.stat(destination)).rejects.toBeInstanceOf(Deno.errors.NotFound);
                expect(report.failures).toHaveLength(2);
                expect(report.failures.every((failure) => failure.repairable)).toBe(true);
                expect(actions(report)).toHaveLength(1);
                expect(report.failures[0]?.repair).toBe(report.failures[1]?.repair);
                expect(await runRepairs(actions(report), signal)).toEqual([
                    {
                        key: actions(report)[0]?.key,
                        description: actions(report)[0]?.description,
                    },
                ]);
                expect(await Deno.readFile(destination)).toEqual(bytes);
                await expect(Deno.stat(source)).rejects.toBeInstanceOf(Deno.errors.NotFound);
                const info = await Deno.stat(destination);
                expect((await Tickets.check(root, signal)).failures).toEqual([]);
                expect(await Deno.stat(destination)).toEqual(info);
            } finally {
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test(
    'tickets keep invalid metadata, duplicate identities and occupied destinations manual',
    async () => {
        const root = await Deno.makeTempDir();
        try {
            const source = await write(root, 'active/wrong.md');
            for (const fields of [
                { id: 'bad' },
                { status: 'invalid' },
                { title: 'Other title' },
                { status: 'closed', reason: 'other' },
                { reason: 'done' },
                { status: 'closed', reason: 'duplicate', 'duplicate-of': '12' },
                { dependencies: false },
                { created_at: undefined },
            ]) {
                await write(root, 'active/wrong.md', { ...metadata, ...fields });
                expect(actions(await Tickets.check(root, signal))).toEqual([]);
            }
            await write(root, 'active/wrong.md');
            const duplicate = await write(root, 'closed/another.md');
            expect(actions(await Tickets.check(root, signal))).toEqual([]);
            await Deno.remove(duplicate);
            const destination = join(root, '.coderail/tickets/open/0012-custom-title.md');
            await Deno.mkdir(join(destination, '..'), { recursive: true });
            for (const kind of ['file', 'directory', 'symlink']) {
                if (kind === 'file') {
                    await Deno.writeTextFile(destination, 'Keep occupied bytes');
                }
                if (kind === 'directory') {
                    await Deno.mkdir(destination);
                }
                if (kind === 'symlink') {
                    await Deno.symlink(join(root, 'absent'), destination);
                }
                expect(actions(await Tickets.check(root, signal))).toEqual([]);
                await Deno.remove(destination);
            }
            expect(await Deno.readTextFile(source)).toContain('Custom body');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'tickets revalidate collected content, identity and destination before relocation',
    async () => {
        for (const change of [
            'content',
            'same-length',
            'identity',
            'unavailable',
            'occupied',
            'cancelled',
            'symlink',
        ]) {
            const root = await Deno.makeTempDir();
            try {
                const source = await write(root, 'active/wrong.md');
                const original = await Deno.readTextFile(source);
                const destination = join(root, '.coderail/tickets/open/0012-custom-title.md');
                const repair = actions(await Tickets.check(root, signal))[0] as DoctorRepair;
                if (change === 'same-length') {
                    await Deno.writeTextFile(
                        source,
                        original.replace('Custom body', 'Edited body'),
                    );
                }
                if (change === 'content') {
                    await Deno.writeTextFile(source, original + 'Edited');
                }
                if (change === 'identity') {
                    await write(root, 'closed/another.md');
                }
                if (change === 'unavailable') {
                    await write(root, 'closed/unknown.md', { ...metadata, id: undefined });
                }
                if (change === 'occupied') {
                    await Deno.mkdir(join(destination, '..'), { recursive: true });
                    await Deno.writeTextFile(destination, 'New occupant');
                }
                if (change === 'symlink') {
                    await Deno.remove(source);
                    const other = join(root, 'other.md');
                    await Deno.writeTextFile(other, original);
                    await Deno.symlink(other, source);
                }
                await expect(
                    repair.apply(
                        change === 'cancelled' ? AbortSignal.abort(new Error('cancelled')) : signal,
                    ),
                ).rejects.toThrow();
                expect(await Deno.readTextFile(source)).toBe(
                    change === 'content'
                        ? original + 'Edited'
                        : change === 'same-length'
                          ? original.replace('Custom body', 'Edited body')
                          : original,
                );
                if (change === 'occupied') {
                    expect(await Deno.readTextFile(destination)).toBe('New occupant');
                } else {
                    await expect(Deno.stat(destination)).rejects.toBeInstanceOf(
                        Deno.errors.NotFound,
                    );
                }
            } finally {
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test('tickets reject source edits during relocation eligibility revalidation', async () => {
    for (const change of ['status', 'body']) {
        const root = await Deno.makeTempDir();
        const readDir = Deno.readDir;
        try {
            const source = await write(root, 'active/wrong.md');
            const original = await Deno.readTextFile(source);
            const destination = join(root, '.coderail/tickets/open/0012-custom-title.md');
            const repair = actions(await Tickets.check(root, signal))[0] as DoctorRepair;
            const edited =
                change === 'status'
                    ? original.replace('status: "open"', 'status: "closed"\nreason: "done"')
                    : original.replace('Custom body', 'Edited body');
            expect(edited).not.toBe(original);
            let injected = false;
            Deno.readDir = async function* (path) {
                if (path === join(root, '.coderail/tickets/active')) {
                    await Deno.writeTextFile(source, edited);
                    injected = true;
                }
                yield* readDir(path);
            };
            await expect(repair.apply(signal)).rejects.toThrow('Collected input changed');
            expect(injected).toBe(true);
            expect(await Deno.readTextFile(source)).toBe(edited);
            await expect(Deno.lstat(destination)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await expect(
                Deno.lstat(join(root, '.coderail/tickets/closed/0012-custom-title.md')),
            ).rejects.toBeInstanceOf(Deno.errors.NotFound);
        } finally {
            Deno.readDir = readDir;
            await Deno.remove(root, { recursive: true });
        }
    }
});

Deno.test('tickets reject symlink destination parents and atomic destination races', async () => {
    for (const race of [false, true]) {
        const root = await Deno.makeTempDir();
        const link = Deno.link;
        try {
            const source = await write(root, 'active/wrong.md');
            const bytes = await Deno.readFile(source);
            const destination = join(root, '.coderail/tickets/open/0012-custom-title.md');
            const repair = actions(await Tickets.check(root, signal))[0] as DoctorRepair;
            if (race) {
                Deno.link = async (from, to) => {
                    await Deno.writeTextFile(to, 'Race occupant');
                    await link(from, to);
                };
                await expect(repair.apply(signal)).rejects.toBeInstanceOf(
                    Deno.errors.AlreadyExists,
                );
                expect(await Deno.readTextFile(destination)).toBe('Race occupant');
            } else {
                const outside = join(root, 'outside');
                await Deno.mkdir(outside);
                await Deno.symlink(outside, join(root, '.coderail/tickets/open'));
                await expect(repair.apply(signal)).rejects.toThrow('destination contains symlinks');
                expect([...Deno.readDirSync(outside)]).toEqual([]);
            }
            expect(await Deno.readFile(source)).toEqual(bytes);
        } finally {
            Deno.link = link;
            await Deno.remove(root, { recursive: true });
        }
    }
});

async function writePlan(root: string, contents: string, name = 'TICKETS.md'): Promise<string> {
    const plans = join(root, '.coderail/plans');
    await Deno.mkdir(plans, { recursive: true });
    const plan = join(plans, name);
    await Deno.writeTextFile(plan, contents);
    return plan;
}

Deno.test(
    'tickets report unresolved plan links without guessing from physical placement',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const readFile = Deno.readFile;
        try {
            await write(root, 'open/0012-custom-title.md');
            const duplicate = await write(root, 'active/0020-custom-title.md', {
                ...metadata,
                id: '0020',
                status: 'active',
            });
            await write(root, 'open/0020-custom-title.md', { ...metadata, id: '0020' });
            await write(root, 'open/0030-custom-title.md', {
                ...metadata,
                id: '0030',
                title: '',
            });
            const original = [
                '[missing](../tickets/closed/9999-custom-title.md)',
                '[ambiguous](../tickets/open/0020-custom-title.md)',
                '[invalid](../tickets/active/0030-custom-title.md)',
                '[wrong slug](../tickets/active/0012-other-title.md)',
                '[current](./../tickets/open/0012-custom-title.md#x)',
                '`[not a link](../tickets/open/8888-custom-title.md)`',
            ].join('\n');
            const plan = await writePlan(root, original);
            const denied = await writePlan(root, 'Unreadable', 'denied.md');
            Deno.readFile = (path, options) =>
                path === denied
                    ? Promise.reject(new Deno.errors.PermissionDenied('plan read denied'))
                    : readFile(path, options);
            const report = await Tickets.check(root, signal);
            const mentions = report.failures.filter((failure) => detail(failure, 'Plan'));
            expect(
                mentions.find(({ message }) => message === 'Unresolved ticket link · 9999')
                    ?.details,
            ).toEqual([
                { label: 'Plan', value: relative(root, plan) },
                { label: 'Current link', value: '../tickets/closed/9999-custom-title.md' },
                { label: 'Target', value: 'Missing target "9999"' },
            ]);
            const messages = mentions.map(findingText).join('\n');
            expect(messages).toContain(
                `Ambiguous target "0020": .coderail/tickets/open/0020-custom-title.md, ${relative(root, duplicate)}`,
            );
            expect(messages).toContain('Unusable target "0030"');
            expect(messages).toContain(
                'Ticket has authoritative slug "custom-title" at ".coderail/tickets/open/0012-custom-title.md"',
            );
            expect(messages).toContain(
                `Plan: ${relative(root, denied)}\nError: Cannot inspect plan links`,
            );
            expect(messages).toContain('plan read denied');
            expect(mentions).toHaveLength(5);
            expect(
                mentions.every(({ repairable, repair }) => !repairable && repair === undefined),
            ).toBe(true);
            expect(actions(report)).toEqual([]);
            expect(await Deno.readTextFile(plan)).toBe(original);
            await write(root, 'open/corrupt.md', { ...metadata, id: undefined });
            expect(
                (await Tickets.check(root, signal)).failures.map(findingText).join('\n'),
            ).toContain('Unavailable target "9999" (inventory incomplete)');
        } finally {
            Deno.readFile = readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('tickets keep both collected and newly occupied placement targets manual', async () => {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        const source = await write(root, 'active/0012-custom-title.md');
        const original = await Deno.readFile(source);
        const open = join(root, '.coderail/tickets/open/0012-custom-title.md');
        const content = '[ticket](../tickets/active/0012-custom-title.md)';
        const plan = await writePlan(root, content);
        const readOnly = await Tickets.check(root, signal);
        const [placement, links] = readOnly.failures;
        expect(placement?.message).toContain('Incorrect placement');
        expect(links?.message).toBe('Stale ticket link · 0012');
        expect(detail(links, 'Expected link')).toBe('../tickets/open/0012-custom-title.md');
        expect(links?.repair).toBe(placement?.repair);
        expect(actions(readOnly)).toHaveLength(1);
        await Deno.mkdir(open, { recursive: true });
        const blocked = await Tickets.check(root, signal);
        expect(blocked.failures).toHaveLength(2);
        expect(actions(blocked)).toEqual([]);
        await expect(links?.repair?.apply(signal)).rejects.toThrow(
            'Ticket relocation is no longer eligible',
        );
        expect(await Deno.readFile(source)).toEqual(original);
        expect(await Deno.readTextFile(plan)).toBe(content);
        expect((await Deno.lstat(open)).isDirectory).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'ticket document repair waits for the source ticket lock and edits its current file',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const original = { temp: Fs.makeTempFile, write: Fs.write };
        const contended = Promise.withResolvers<void>();
        const sourceLock = join(root, '.coderail/.locks/tickets/0012.lock');
        const targetLock = join(root, '.coderail/.locks/tickets/0001.lock');
        let repair: Promise<void> | undefined;
        try {
            const oldSource = await write(root, 'open/0012-custom-title.md');
            const stale = '[Target](0001-custom-title.md#details)\r\n';
            await Deno.writeTextFile(oldSource, stale, { append: true });
            await write(root, 'closed/0001-custom-title.md', {
                ...metadata,
                id: '0001',
                status: 'closed',
                reason: 'done',
            });
            const [action] = actions(await Tickets.check(root, signal));
            expect(action?.key).toBe('ticket-link:0012:0001');
            Fs.makeTempFile = async (path) => {
                try {
                    return await original.temp(path);
                } catch (error) {
                    if (path === sourceLock && error instanceof Deno.errors.AlreadyExists) {
                        contended.resolve();
                    }
                    throw error;
                }
            };
            Fs.write = async (path, content) => {
                expect((await Deno.lstat(sourceLock)).isFile).toBe(true);
                expect((await Deno.lstat(targetLock)).isFile).toBe(true);
                await original.write(path, content);
            };
            const updated = await withTicketLock(root, '0012', signal, async () => {
                repair = (action as DoctorRepair).apply(signal);
                await Promise.race([
                    contended.promise,
                    repair.then(() => {
                        throw new Error('Doctor completed before contending for the source lock');
                    }),
                ]);
                const active = await write(root, 'active/0012-custom-title.md', {
                    ...metadata,
                    status: 'active',
                });
                await Deno.writeTextFile(active, `${stale}New text.\r\n`, { append: true });
                await Deno.remove(oldSource);
                return active;
            });
            await repair;
            expect(await Deno.readTextFile(updated)).toContain(
                '[Target](../closed/0001-custom-title.md#details)\r\nNew text.\r\n',
            );
            await expect(Deno.lstat(oldSource)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect((await Tickets.check(root, signal)).failures).toEqual([]);
        } finally {
            await Promise.allSettled([repair]);
            Fs.makeTempFile = original.temp;
            Fs.write = original.write;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'ticket link repair waits for the status command and uses the state it publishes',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const original = {
            readFile: Deno.readFile,
            temp: Fs.makeTempFile,
            warn: Log.warn,
            output: Log.output,
        };
        const scanStarted = Promise.withResolvers<void>();
        const resumeScan = Promise.withResolvers<void>();
        const contention = Promise.withResolvers<void>();
        let activation: Promise<void> | undefined;
        let repair: Promise<void> | undefined;
        try {
            const open = await write(root, 'open/0012-custom-title.md');
            const plan = await writePlan(root, '[ticket](../tickets/closed/0012-custom-title.md)');
            const alias = join(root, 'alias');
            await Deno.symlink(root, alias, { type: 'dir' });
            const [action] = actions(await Tickets.check(alias, signal));
            expect(action?.description).toContain('Update plan links');
            let attempted = false;
            Deno.readFile = async (path, options) => {
                if (path === plan && !attempted) {
                    attempted = true;
                    scanStarted.resolve();
                    await resumeScan.promise;
                    throw new Error('Status scan denied');
                }
                return original.readFile(path, options);
            };
            const lock = join(root, '.coderail/.locks/tickets/0012.lock');
            Fs.makeTempFile = async (path) => {
                try {
                    return await original.temp(path);
                } catch (error) {
                    if (path === lock && error instanceof Deno.errors.AlreadyExists) {
                        contention.resolve();
                    }
                    throw error;
                }
            };
            const warnings: string[] = [];
            Log.warn = (...messages) => {
                warnings.push(messages.join(' '));
            };
            Log.output = () => {};
            const activate = new Activate();
            activation = activate.run({
                parsedArguments: activate.parseArguments(['0012-custom-title.md']),
                context: { currentWorkingDirectory: root, installRoot: root },
                configuration: Conf.createConfiguration({
                    verbose: false,
                    quiet: false,
                    help: false,
                    version: false,
                    noColor: true,
                    nonInteractive: true,
                }),
                signal,
            });
            await Promise.race([
                scanStarted.promise,
                activation.then(() => {
                    throw new Error('Status command completed before scanning');
                }),
            ]);
            repair = (action as DoctorRepair).apply(signal);
            await Promise.race([
                contention.promise,
                repair.then(() => {
                    throw new Error('Doctor completed before contending for the lock');
                }),
            ]);
            expect(await Deno.readTextFile(open)).toContain('status: "open"');
            resumeScan.resolve();
            await Promise.all([activation, repair]);
            expect(warnings.join('\n')).toContain('Status scan denied');
            await expect(Deno.lstat(open)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            await expect(Deno.lstat(lock)).rejects.toBeInstanceOf(Deno.errors.NotFound);
            expect(await Deno.readTextFile(plan)).toBe(
                '[ticket](../tickets/active/0012-custom-title.md)',
            );
            expect((await Tickets.check(root, signal)).failures).toEqual([]);
        } finally {
            resumeScan.resolve();
            await Promise.allSettled([activation, repair]);
            Deno.readFile = original.readFile;
            Fs.makeTempFile = original.temp;
            Log.warn = original.warn;
            Log.output = original.output;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'ticket repair reports a fresh plan scan failure and still updates another document',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const readFile = Deno.readFile;
        try {
            const ticket = await write(root, 'open/0012-custom-title.md');
            const original = '[ticket](../tickets/active/0012-custom-title.md)';
            const denied = await writePlan(root, original, 'denied.md');
            const other = await writePlan(root, original, 'other.md');
            const pending = actions(await Tickets.check(root, signal));
            expect(pending).toHaveLength(1);
            const ticketBytes = await readFile(ticket);
            const mtime = (await Deno.stat(ticket)).mtime;
            Deno.readFile = (path, options) =>
                path === denied
                    ? Promise.reject(new Deno.errors.PermissionDenied('fresh read denied'))
                    : readFile(path, options);
            const [result] = await runRepairs(pending, signal);
            expect(result?.error).toContain(`"${denied}": Cannot inspect plan links`);
            expect(result?.error).toContain('fresh read denied');
            expect(await Deno.readTextFile(denied)).toBe(original);
            expect(await Deno.readTextFile(other)).toBe(original.replace('/active/', '/open/'));
            expect(await readFile(ticket)).toEqual(ticketBytes);
            expect((await Deno.stat(ticket)).mtime).toEqual(mtime);
        } finally {
            Deno.readFile = readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'ticket repair rejects a source changed to a symlink during the fresh plan scan',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        const readFile = Deno.readFile;
        try {
            const source = await write(root, 'open/0012-custom-title.md');
            const original = await readFile(source);
            const body = '[ticket](../tickets/active/0012-custom-title.md)';
            const plan = await writePlan(root, body);
            const [action] = actions(await Tickets.check(root, signal));
            const other = join(root, 'outside.md');
            Deno.readFile = async (path, options) => {
                if (path === plan) {
                    await Deno.rename(source, other);
                    await Deno.symlink(other, source);
                }
                return readFile(path, options);
            };
            await expect((action as DoctorRepair).apply(signal)).rejects.toThrow(
                `Expected regular ticket file and directories at "${source}"`,
            );
            expect(await readFile(other)).toEqual(original);
            expect((await Deno.lstat(source)).isSymlink).toBe(true);
            expect(await Deno.readTextFile(plan)).toBe(body);
        } finally {
            Deno.readFile = readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('ticket repair does not move newly misplaced inputs', async () => {
    for (const status of ['open', 'active']) {
        const root = await Deno.realPath(await Deno.makeTempDir());
        try {
            const filename = '0012-custom-title.md';
            const source = await write(root, `${status}/${filename}`);
            const body = '[ticket](../tickets/closed/0012-custom-title.md)';
            const plan = await writePlan(root, body);
            const [action] = actions(await Tickets.check(root, signal));
            const newSource = join(root, '.coderail/tickets/closed', filename);
            await Deno.mkdir(join(newSource, '..'), { recursive: true });
            await Deno.rename(source, newSource);
            await expect((action as DoctorRepair).apply(signal)).rejects.toThrow(
                'Ticket relocation is no longer eligible',
            );
            expect(await Deno.readTextFile(plan)).toBe(body);
            expect(await Deno.readTextFile(newSource)).toContain('status: "open"');
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    }
});
