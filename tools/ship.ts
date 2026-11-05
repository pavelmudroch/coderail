const usage = `Usage: deno run -A tools/ship.ts <major|minor|patch> [--dry]

Choose exactly one bump: major resets minor/patch, minor resets patch,
or patch increments patch. Release dates use UTC.
--dry performs preflight (including fetch) and writes unstaged version/changelog
edits, with no commit, tag, or push. Reset dry edits before shipping normally.
--help prints this help without accessing Git or release inputs.

Run application tests before ship. Ship only prepares, commits, tags, and
atomically pushes main and the release tag; GitHub Actions owns publication.
`;

type Bump = 'major' | 'minor' | 'patch';
type Preparation = { version: string; versionSource: string; changelog: string };
const versionPath = 'src/cli/version.ts';
const changelogPath = 'CHANGELOG.md';
const repository = 'https://github.com/pavelmudroch/coderail';

// Pure preparation seam for tool tests; this is not part of the application API.
export function prepareRelease(
    versionSource: string,
    changelog: string,
    bump: Bump,
    date: Date,
): Preparation {
    const declaration = /export const CODERAIL_VERSION = '([^']+)';/g;
    const declarations = [...versionSource.matchAll(declaration)];
    const current = declarations[0]?.[1];
    if (
        declarations.length !== 1 ||
        !current ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current)
    ) {
        throw new Error('Invalid current version declaration. Expected stable X.Y.Z.');
    }
    const parts = current.split('.').map(Number);
    const index = { major: 0, minor: 1, patch: 2 }[bump];
    const next = parts.map((part, i) => (i < index ? part : i === index ? part + 1 : 0));
    if (![...parts, ...next].every(Number.isSafeInteger)) {
        throw new Error('Invalid version: components must be safe integers after the bump.');
    }
    const version = next.join('.');
    const updatedSource = versionSource.replace(
        declaration,
        `export const CODERAIL_VERSION = '${version}';`,
    );
    if (
        new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\](?:[^\\r\\n]*)$`, 'm').test(
            changelog,
        )
    ) {
        return { version, versionSource: updatedSource, changelog };
    }

    const unreleased = /^## \[Unreleased\][^\r\n]*\r?\n/m.exec(changelog);
    if (!unreleased) {
        throw new Error('Missing Unreleased section in CHANGELOG.md.');
    }
    const start = unreleased.index + unreleased[0].length;
    const rest = changelog.slice(start);
    const boundary = /^(?:## |\[[^\]\r\n]+\]:)/m.exec(rest);
    const end = start + (boundary?.index ?? rest.length);
    const body = changelog.slice(start, end);
    const entries = body.replace(/^\s*#{3,6}[^\r\n]*$/gm, '').trim();
    if (!entries) {
        throw new Error('Unreleased must contain authored entries before shipping.');
    }
    const previous = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog.slice(end))?.[1];
    const eol = unreleased[0].endsWith('\r\n') ? '\r\n' : '\n';
    // Keep the entry body itself intact, including its whitespace and links.
    let updated =
        changelog.slice(0, start) +
        eol +
        `## [${version}] - ${date.toISOString().slice(0, 10)}${eol}` +
        body +
        changelog.slice(end);
    const unreleasedLink = `[Unreleased]: ${repository}/compare/v${version}...HEAD`;
    if (/^\[Unreleased\]:[^\r\n]*/m.test(updated)) {
        updated = updated.replace(/^\[Unreleased\]:[^\r\n]*/m, unreleasedLink);
    } else {
        updated += (updated.endsWith('\n') ? eol : `${eol}${eol}`) + unreleasedLink + eol;
    }
    const releaseLink = previous
        ? `${repository}/compare/v${previous}...v${version}`
        : `${repository}/releases/tag/v${version}`;
    updated += (updated.endsWith('\n') ? '' : eol) + `[${version}]: ${releaseLink}${eol}`;
    return { version, versionSource: updatedSource, changelog: updated };
}

function parse(args: string[]): { bump: Bump; dry: boolean } | 'help' {
    if (args.length === 1 && args[0] === '--help') {
        return 'help';
    }
    const bumps = args.filter((arg) => arg === 'major' || arg === 'minor' || arg === 'patch');
    const dry = args.includes('--dry');
    if (bumps.length !== 1 || args.length !== (dry ? 2 : 1)) {
        throw new Error(usage);
    }
    const bump = bumps[0];
    if (bump !== 'major' && bump !== 'minor' && bump !== 'patch') {
        throw new Error(usage);
    }
    return { bump, dry };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await new Deno.Command('git', {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    const decoder = new TextDecoder();
    if (!result.success) {
        throw new Error(
            `git ${args.join(' ')} failed (${result.code}):\n${decoder.decode(result.stderr)}${decoder.decode(result.stdout)}`,
        );
    }
    return decoder.decode(result.stdout).trim();
}

async function main(): Promise<void> {
    let step = 'arguments';
    let state = 'No release edits attempted.';
    try {
        const options = parse(Deno.args);
        if (options === 'help') {
            console.log(usage);
            return;
        }
        step = 'repository preflight';
        const root = await git(Deno.cwd(), 'rev-parse', '--show-toplevel');
        if ((await git(root, 'symbolic-ref', '--short', 'HEAD')) !== 'main') {
            throw new Error('Ship requires the main branch.');
        }
        for (const path of [versionPath, changelogPath]) {
            try {
                await git(root, 'ls-files', '--error-unmatch', '--', path);
            } catch {
                throw new Error(`Release input must be tracked: ${path}`);
            }
        }
        if (await git(root, 'status', '--porcelain', '--untracked-files=no')) {
            throw new Error('Ship requires a clean tracked working tree and index.');
        }
        step = 'fetch origin';
        await git(
            root,
            'fetch',
            '--no-tags',
            'origin',
            '+refs/heads/main:refs/remotes/origin/main',
        );
        step = 'synchronized main preflight';
        if (
            (await git(root, 'rev-parse', 'HEAD')) !==
            (await git(root, 'rev-parse', 'refs/remotes/origin/main'))
        ) {
            throw new Error('main must be synchronized with fetched origin/main.');
        }
        step = 'release preparation validation';
        const source = await Deno.readTextFile(`${root}/${versionPath}`);
        const changelog = await Deno.readTextFile(`${root}/${changelogPath}`);
        const prepared = prepareRelease(source, changelog, options.bump, new Date());
        const tag = `v${prepared.version}`;
        step = 'target tag preflight';
        if (await git(root, 'tag', '--list', tag)) {
            throw new Error(`Target tag already exists locally: ${tag}`);
        }
        if (await git(root, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) {
            throw new Error(`Target tag already exists remotely: ${tag}`);
        }
        step = 'write release inputs';
        state = `Release input edits may be present in ${versionPath} and ${changelogPath}; retained for manual inspection.`;
        await Deno.writeTextFile(`${root}/${versionPath}`, prepared.versionSource);
        if (prepared.changelog !== changelog) {
            await Deno.writeTextFile(`${root}/${changelogPath}`, prepared.changelog);
        }
        if (options.dry) {
            console.log(`Prepared ${tag}: unstaged edits only; no commit, tag, or push.`);
            return;
        }
        step = 'stage release inputs';
        await git(root, 'add', '--', versionPath, changelogPath);
        state += ' Release inputs may be staged.';
        step = 'release commit';
        state += ' Inspect HEAD for any release commit created.';
        await git(root, 'commit', '-m', `Release ${tag}`);
        const commit = await git(root, 'rev-parse', 'HEAD');
        state += ` Local release commit ${commit} retained.`;
        step = 'release tag';
        await git(root, 'tag', '-a', '-m', `Release ${tag}`, tag, commit);
        state += ` Local tag ${tag} retained.`;
        step = 'atomic push';
        await git(
            root,
            'push',
            '--atomic',
            '--no-follow-tags',
            'origin',
            `${commit}:refs/heads/main`,
            `refs/tags/${tag}:refs/tags/${tag}`,
        );
        console.log(`Shipped ${tag} (${commit}). GitHub Actions owns compilation and publication.`);
    } catch (error) {
        console.error(
            `Ship failed during ${step}: ${error instanceof Error ? error.message : String(error)}\n${state}\nInspect local and remote state manually; ship performs no rollback or retry.`,
        );
        Deno.exitCode = 1;
    }
}

if (import.meta.main) {
    await main();
}
