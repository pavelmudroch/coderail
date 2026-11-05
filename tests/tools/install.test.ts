import { expect } from '@std/expect';
import { join } from '@std/path';

const installer = join(Deno.cwd(), 'install.sh');

async function fixture(
    run: (root: string, env: Record<string, string>) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir({ prefix: 'installer test ' });
    const tools = join(root, 'tools');
    await Deno.mkdir(tools);
    const scripts: Record<string, string> = {
        uname: 'case "$1" in -s) echo "${FAKE_OS:-Linux}";; -m) echo "${FAKE_ARCH:-x86_64}";; esac',
        curl: `echo "$*" >> "$LOG"
case "$*" in
  *"$FAIL_URL"*) [ -z "$FAIL_URL" ] || exit 22 ;;
esac
case "$*" in
  *releases/latest*) printf '%s\\n' "$PUBLICATION" ;;
  *releases/1/assets*) printf '[{"id":2,"name":"coderail-%s.zip","size":4,"state":"uploaded"},{"id":3,"name":"coderail-%s.zip.sha256","size":90,"state":"uploaded"}]\\n' "$TARGET" "$TARGET" ;;
  *releases/assets/2*) printf 'data' ;;
  *releases/assets/3*) printf '%064d  coderail-%s.zip\\n' 0 "$TARGET" ;;
  *) exit 1 ;;
esac`,
        sha256sum: 'printf "%064d  %s\\n" 0 "$1"',
        unzip: `cat <<'SCRIPT'
#!/bin/sh
echo "$*" >> "$CLI_LOG"
if [ "$1" = --version ]; then echo 'Coderail version 1.2.3'; exit 0; fi
exit "$UPGRADE_STATUS"
SCRIPT`,
    };
    for (const [name, body] of Object.entries(scripts)) {
        await Deno.writeTextFile(join(tools, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
    const env = {
        ...Deno.env.toObject(),
        PATH: `${tools}:/usr/bin:/bin`,
        HOME: root,
        CODERAIL_INSTALL_ROOT: join(root, 'install root'),
        LOG: join(root, 'downloads'),
        CLI_LOG: join(root, 'cli'),
        TARGET: 'x86_64-unknown-linux-gnu',
        UPGRADE_STATUS: '0',
        FAIL_URL: '',
        PUBLICATION: JSON.stringify({
            id: 1,
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            target_commitish: '0123456789012345678901234567890123456789',
            updated_at: 'now',
        }),
    };
    try {
        await run(root, env);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
}

async function install(env: Record<string, string>): Promise<Deno.CommandOutput> {
    return await new Deno.Command('sh', {
        args: [installer],
        env,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
}

async function read(path: string): Promise<string> {
    try {
        return await Deno.readTextFile(path);
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return '';
        }
        throw error;
    }
}

Deno.test('installer resolves latest once and pins bootstrap on supported hosts', async () => {
    for (const [os, arch, target] of [
        ['Linux', 'x86_64', 'x86_64-unknown-linux-gnu'],
        ['Linux', 'aarch64', 'aarch64-unknown-linux-gnu'],
        ['Darwin', 'x86_64', 'x86_64-apple-darwin'],
        ['Darwin', 'arm64', 'aarch64-apple-darwin'],
    ]) {
        await fixture(async (_root, env) => {
            Object.assign(env, { FAKE_OS: os, FAKE_ARCH: arch, TARGET: target });
            const result = await install(env);
            expect(new TextDecoder().decode(result.stderr)).toBe('');
            expect(result.success).toBe(true);
            const requests = await read(env.LOG ?? '');
            expect(requests.match(/releases\/latest/g)?.length).toBe(1);
            expect(await read(env.CLI_LOG ?? '')).toContain('upgrade --version 1.2.3');
        });
    }
});

Deno.test(
    'healthy installations delegate once and never bootstrap on upgrade failure',
    async () => {
        await fixture(async (_root, env) => {
            const bin = join(env.CODERAIL_INSTALL_ROOT ?? '', 'bin');
            await Deno.mkdir(bin, { recursive: true });
            const libexec = join(env.CODERAIL_INSTALL_ROOT ?? '', 'libexec');
            await Deno.mkdir(libexec);
            await Deno.writeTextFile(
                join(libexec, 'cr-1.2.3'),
                '#!/bin/sh\necho "$*" >> "$CLI_LOG"\n[ "$1" = --version ] && { echo "Coderail version 1.2.3"; exit 0; }\nexit 23\n',
                { mode: 0o755 },
            );
            await Deno.symlink('../libexec/cr-1.2.3', join(bin, 'cr'));
            const result = await install(env);
            expect(result.code).toBe(23);
            expect(await read(env.CLI_LOG ?? '')).toBe('--version\nupgrade --version latest\n');
            expect(await read(env.LOG ?? '')).toBe('');
        });
    },
);

Deno.test('installer rejects invalid latest and unsupported hosts before execution', async () => {
    for (const overrides of [
        { FAKE_OS: 'Windows' },
        { PUBLICATION: '{"id":1,"tag_name":"canary","draft":false,"prerelease":true}' },
        { PUBLICATION: '{"id":1,"tag_name":"v1.2.3","draft":true,"prerelease":false}' },
    ]) {
        await fixture(async (_root, env) => {
            Object.assign(env, overrides);
            expect((await install(env)).success).toBe(false);
            expect(await read(env.CLI_LOG ?? '')).toBe('');
        });
    }
});

Deno.test('download and checksum failures never execute the bootstrap', async () => {
    for (const failUrl of ['releases/latest', 'releases/assets/2', 'releases/assets/3']) {
        await fixture(async (_root, env) => {
            env.FAIL_URL = failUrl;
            expect((await install(env)).success).toBe(false);
            expect(await read(env.CLI_LOG ?? '')).toBe('');
        });
    }
    await fixture(async (root, env) => {
        await Deno.writeTextFile(
            join(root, 'tools', 'sha256sum'),
            '#!/bin/sh\nprintf "%064d  %s\\n" 1 "$1"\n',
            { mode: 0o755 },
        );
        expect((await install(env)).success).toBe(false);
        expect(await read(env.CLI_LOG ?? '')).toBe('');
    });
});

Deno.test('failed bootstrap removes unused executable and preserves existing data', async () => {
    await fixture(async (_root, env) => {
        const root = env.CODERAIL_INSTALL_ROOT ?? '';
        await Deno.mkdir(join(root, 'templates'), { recursive: true });
        await Deno.writeTextFile(join(root, 'templates', 'user.txt'), 'keep');
        env.UPGRADE_STATUS = '42';
        expect((await install(env)).code).toBe(42);
        expect(await read(join(root, 'templates', 'user.txt'))).toBe('keep');
        const files: string[] = [];
        for await (const file of Deno.readDir(join(root, 'libexec'))) {
            files.push(file.name);
        }
        expect(files).toEqual([]);
    });
});
