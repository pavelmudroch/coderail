import { dirname, join } from '@std/path';

import { ARCHIVE_REF } from '../../src/archive/history.ts';

export async function fixtureGit(root: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd: root,
        args: ['-c', 'user.name=Archive Tests', '-c', 'user.email=archive@example.test', ...args],
        env: { GIT_OPTIONAL_LOCKS: '0' },
    }).output();
    if (!result.success) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout).trim();
}

export async function withArchiveFixture(
    files: Record<string, string | Uint8Array>,
    run: (root: string) => Promise<void>,
): Promise<void> {
    const temporary = await Deno.makeTempDir();
    try {
        const root = join(temporary, 'source');
        const archive = join(temporary, 'archive');
        await Deno.mkdir(root);
        await Deno.mkdir(archive);
        await fixtureGit(root, 'init', '-q');
        await Deno.writeTextFile(join(root, 'README.md'), 'source checkout\n');
        await fixtureGit(root, 'add', 'README.md');
        await fixtureGit(root, 'commit', '-qm', 'Source', '--no-gpg-sign');

        await fixtureGit(archive, 'init', '-q');
        for (const [path, content] of Object.entries(files)) {
            const file = join(archive, path);
            await Deno.mkdir(dirname(file), { recursive: true });
            const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
            await Deno.writeFile(file, bytes);
        }
        await fixtureGit(archive, 'add', '.');
        await fixtureGit(archive, 'commit', '--allow-empty', '-qm', 'Archive', '--no-gpg-sign');
        await fixtureGit(root, 'fetch', '--no-tags', archive, `HEAD:${ARCHIVE_REF}`);
        await run(root);
    } finally {
        await Deno.remove(temporary, { recursive: true });
    }
}

export const batch = '2026-11-25_alpha';
export const rawFile = new Uint8Array([0xef, 0xbb, 0xbf, 0x80, 0, 13, 10, 255]);
const parent = `${batch}/plans/parent`;
const child = `${parent}/child`;
export const artifactPath = `${parent}/nested/files/notes [draft] #1.bin`;
const artifactWithIdeaName = `${parent}/nested/files/IDEA.md`;
export const ticketPath = `${batch}/tickets/0009-small.md`;

export const archiveFiles = {
    [`${batch}/README.md`]: 'Archive overview without a trailing newline',
    [`${parent}/IDEA.md`]: '---\ntitle: "Parent idea"\nstatus: "split"\n---\n',
    [`${parent}/SPEC.md`]: 'Specification',
    [artifactPath]: rawFile,
    [artifactWithIdeaName]: 'Arbitrary fixture artifact',
    [`${child}/IDEA.md`]: '---\ntitle: "Child idea"\nstatus: "archived"\n---\n',
    [`${child}/design.txt`]: 'Design',
    [`${batch}/plans/no-idea/file.txt`]: 'No idea metadata here',
    [`${batch}/tickets/README.md`]: 'Ticket notes',
    [`${batch}/tickets/subtree/0001-ignored.md`]: 'Outside the defined layout',
    [ticketPath]: '---\nid: "0009"\ntitle: "Small ticket"\n---\n',
    [`${batch}/tickets/10000-large.md`]: '---\nid: "10000"\ntitle: "Large ticket"\n---\n',
    [`${batch}/tickets/9999-last-four.md`]: '---\nid: "9999"\ntitle: "Last four digits"\n---\n',
    '2026-11-25_zulu/README.md': '',
    '2026-11-24_previous/tickets/0009-other.md': '---\nid: "0009"\ntitle: "Other ticket"\n---\n',
    '2026-11-27_file': 'A blob with a batch-like name',
    'a-directory/README.md': 'A directory without a batch ID',
};

export const expectedPlans = [
    {
        title: 'Parent idea',
        path: `${parent}/IDEA.md`,
        parent: null,
        artifacts: [`${parent}/SPEC.md`, artifactWithIdeaName, artifactPath],
    },
    {
        title: 'Child idea',
        path: `${child}/IDEA.md`,
        parent: `${parent}/IDEA.md`,
        artifacts: [`${child}/design.txt`],
    },
];
