import { expect } from '@std/expect';
import { fromFileUrl, join } from '@std/path';

export const installer = fromFileUrl(new URL('../../install.sh', import.meta.url));
const decoder = new TextDecoder();

export async function executable(path: string, text: string): Promise<void> {
    await Deno.writeTextFile(path, `#!/bin/sh\nset -eu\n${text}\n`, { mode: 0o755 });
}

export async function fixture(run: (f: InstallerFixture) => Promise<void>): Promise<void> {
    const temporary = await Deno.realPath(await Deno.makeTempDir({ prefix: 'installer space-' }));
    try {
        const f = new InstallerFixture(temporary);
        await f.setup();
        await run(f);
    } finally {
        await Deno.remove(temporary, { recursive: true });
    }
}

export class InstallerFixture {
    readonly tools: string;
    readonly root: string;
    readonly home: string;
    readonly downloads: string;
    readonly requests: string;
    readonly invocations: string;
    readonly env: Record<string, string>;

    constructor(readonly temporary: string) {
        this.tools = join(temporary, 'tools');
        this.root = join(temporary, 'selected root');
        this.home = join(temporary, 'home space');
        this.downloads = join(temporary, 'downloads');
        this.requests = join(temporary, 'requests');
        this.invocations = join(temporary, 'invocations');
        this.env = {
            PATH: this.tools,
            HOME: this.home,
            SHELL: '/bin/bash',
            TMPDIR: this.downloads,
            CODERAIL_INSTALL_ROOT: this.root,
            FIXTURE: temporary,
            HOST_OS: 'Linux',
            HOST_ARCH: 'x86_64',
        };
    }

    async setup(): Promise<void> {
        for (const path of [this.tools, this.home, this.downloads]) {
            await Deno.mkdir(path);
        }
        for (const name of [
            'mkdir',
            'jq',
            'unzip',
            'mktemp',
            'chmod',
            'rm',
            'dirname',
            'basename',
            'readlink',
            'cmp',
            'shasum',
            'cat',
            'ln',
            'kill',
        ]) {
            const found = await new Deno.Command('/bin/sh', {
                args: ['-c', `command -v ${name}`],
                stdout: 'piped',
            }).output();
            expect(found.success, `Missing fixture tool ${name}`).toBe(true);
            await Deno.symlink(decoder.decode(found.stdout).trim(), join(this.tools, name));
        }
        await executable(
            join(this.tools, 'uname'),
            'case $1 in -s) echo "$HOST_OS";; -m) echo "$HOST_ARCH";; esac',
        );
        await executable(
            join(this.tools, 'curl'),
            `
for url do :; done
printf '%s\\n' "$url" >> "$FIXTURE/requests"
case "$url" in
    */releases/latest) file=release;;
    */releases/7/assets*) file=assets;;
    */releases/assets/10) file=archive;;
    */releases/assets/11) file=checksum;;
    *) echo "unexpected request: $url" >&2; exit 91;;
esac
[ "\${FAIL_DOWNLOAD:-}" != "$file" ] || exit 22
cat "$FIXTURE/$file"
`,
        );
        await this.release();
        await this.archive();
    }

    async release(overrides: Record<string, unknown> = {}): Promise<void> {
        await Deno.writeTextFile(
            join(this.temporary, 'release'),
            JSON.stringify({
                id: 7,
                tag_name: 'v2.10.0',
                draft: false,
                prerelease: false,
                target_commitish: 'a'.repeat(40),
                updated_at: 'today',
                ...overrides,
            }),
        );
    }

    async archive(platform = 'x86_64-unknown-linux-gnu', bytes?: Uint8Array): Promise<void> {
        const name = `coderail-${platform}.zip`;
        const archive = bytes ?? new TextEncoder().encode('fake archive');
        await Deno.writeTextFile(
            join(this.temporary, 'assets'),
            JSON.stringify([
                { id: 10, name, size: archive.length, updated_at: 'today', state: 'uploaded' },
                {
                    id: 11,
                    name: `${name}.sha256`,
                    size: 64 + 2 + name.length + 1,
                    updated_at: 'today',
                    state: 'uploaded',
                },
            ]),
        );
        await Deno.writeFile(join(this.temporary, 'archive'), archive);
        const digest = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(archive))),
            (b) => b.toString(16).padStart(2, '0'),
        ).join('');
        await Deno.writeTextFile(join(this.temporary, 'checksum'), `${digest}  ${name}\n`);
        if (!bytes) {
            await Deno.remove(join(this.tools, 'unzip'));
            await executable(join(this.tools, 'unzip'), 'cat "$FIXTURE/bootstrap"');
            await this.bootstrap();
        }
    }

    async bootstrap(
        body = `
root=$(dirname "$(dirname "$0")")
mkdir -p "$root/bin"
ln -sf "$0" "$root/bin/cr"
`,
    ): Promise<void> {
        await executable(
            join(this.temporary, 'bootstrap'),
            `
if [ "\${1:-}" = --version ]; then echo 'Coderail version 2.10.0'; exit 0; fi
printf '%s\\n' "$0" "$@" >> "$FIXTURE/invocations"
${body}`,
        );
    }

    async run(
        args: string[] = [],
        env: Record<string, string> = {},
    ): Promise<{ code: number; output: string }> {
        const result = await new Deno.Command('/bin/sh', {
            cwd: this.home,
            args: [installer, ...args],
            env: { ...this.env, ...env },
            stdin: 'null',
            stdout: 'piped',
            stderr: 'piped',
        }).output();
        return {
            code: result.code,
            output: decoder.decode(result.stdout) + decoder.decode(result.stderr),
        };
    }

    async calls(path = this.requests): Promise<string[]> {
        try {
            return (await Deno.readTextFile(path)).trim().split('\n');
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return [];
            }
            throw error;
        }
    }

    clean(): void {
        // Deno's compiled runtime may leave its own cache alongside installer temp files.
        expect(
            [...Deno.readDirSync(this.downloads)].filter(
                (file) => !file.name.startsWith('deno-compile-'),
            ),
        ).toEqual([]);
    }
}
