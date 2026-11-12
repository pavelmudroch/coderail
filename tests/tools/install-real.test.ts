import { expect } from '@std/expect';
import { fromFileUrl, join } from '@std/path';

import { targetTriple } from '../../src/installation/distribution.ts';
import { fixture, installer } from './install-fixture.ts';

const decoder = new TextDecoder();

async function command(cwd: string, program: string, args: string[]): Promise<void> {
    const result = await new Deno.Command(program, {
        cwd,
        args,
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    expect(result.success, decoder.decode(result.stderr)).toBe(true);
}

Deno.test({
    name: 'installer reconciles real compiled CLI through local releases and terminal PATH consent',
    ignore: Deno.build.os === 'windows',
    async fn() {
        await fixture(async (f) => {
            const source = join(f.temporary, 'entry.ts');
            const main = new URL('../../src/main.ts', import.meta.url).href;
            // Compile the actual entrypoint with only its network transport replaced.
            // No production endpoint, user profile or published release is touched.
            await Deno.writeTextFile(
                source,
                `
const fixture = Deno.env.get('FIXTURE')!;
globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    await Deno.writeTextFile(fixture + '/cli-requests', url.pathname + '\\n', { append: true });
    if (Deno.env.get('FAIL_CLI')) throw new Error('fixture network failure');
    if (url.pathname.endsWith('/releases/latest')) {
        if (Deno.env.get('REQUIRE_PIN')) throw new Error('latest resolved twice');
        return new Response(await Deno.readFile(fixture + '/release'));
    }
    if (url.pathname.endsWith('/releases')) {
        const release = JSON.parse(await Deno.readTextFile(fixture + '/release'));
        return Response.json(url.searchParams.get('page') === '1' ? [release] : []);
    }
    if (url.pathname.endsWith('/assets')) {
        return new Response(url.searchParams.get('page') === '1'
            ? await Deno.readFile(fixture + '/assets') : '[]');
    }
    const file = url.pathname.endsWith('/10') ? 'archive'
        : url.pathname.endsWith('/11') ? 'checksum' : 'release';
    return new Response(await Deno.readFile(fixture + '/' + file));
};
await import(${JSON.stringify(main)});
`,
            );
            const packageRoot = join(f.temporary, 'package');
            await Deno.mkdir(packageRoot);
            await command(f.temporary, Deno.execPath(), [
                'compile',
                '-A',
                '--config',
                fromFileUrl(new URL('../../deno.json', import.meta.url)),
                '--output',
                join(packageRoot, 'cr'),
                source,
            ]);
            await Deno.mkdir(join(packageRoot, 'instructions'));
            await Deno.mkdir(join(packageRoot, 'templates'));
            await Deno.writeTextFile(join(packageRoot, 'instructions/a.md'), 'managed instruction');
            await Deno.writeTextFile(join(packageRoot, 'templates/default.md'), 'default template');
            const target = targetTriple(Deno.build.os, Deno.build.arch);
            await Deno.writeTextFile(
                join(packageRoot, 'build.json'),
                JSON.stringify({
                    schemaVersion: 1,
                    version: '2.10.0',
                    commit: 'a'.repeat(40),
                    target,
                }),
            );
            await command(packageRoot, 'zip', ['-q', '-r', join(f.temporary, 'real.zip'), '.']);
            await f.archive(target, await Deno.readFile(join(f.temporary, 'real.zip')));
            await Deno.remove(join(f.tools, 'unzip'));
            await Deno.symlink('/usr/bin/unzip', join(f.tools, 'unzip'));
            f.env.HOST_OS = Deno.build.os === 'darwin' ? 'Darwin' : 'Linux';
            f.env.HOST_ARCH = Deno.build.arch;

            const first = await f.run(['--no-color'], { REQUIRE_PIN: '1' });
            expect(first.code, first.output).toBe(0);
            expect(first.output).toContain(`${f.root}/bin`);
            expect(first.output).toContain('export PATH=');
            expect(await f.calls(join(f.temporary, 'cli-requests'))).not.toContain(
                '/repos/pavelmudroch/coderail/releases/latest',
            );
            expect(await Deno.readTextFile(join(f.root, 'instructions/a.md'))).toBe(
                'managed instruction',
            );
            await expect(Deno.stat(join(f.home, '.bashrc'))).rejects.toThrow();
            await f.clean();

            await Deno.remove(join(f.root, 'instructions/a.md'));
            await Deno.writeTextFile(join(f.root, 'templates/personal.md'), 'personal template');
            await Deno.writeTextFile(join(f.root, 'unrelated'), 'keep');
            const rerun = await f.run(['--non-interactive', '--no-color']);
            expect(rerun.code, rerun.output).toBe(0);
            expect(rerun.output).toContain('export PATH=');
            expect((await f.calls()).length).toBe(4); // Healthy reruns do not bootstrap.
            expect(await Deno.readTextFile(join(f.root, 'instructions/a.md'))).toBe(
                'managed instruction',
            );
            expect(await Deno.readTextFile(join(f.root, 'templates/personal.md'))).toBe(
                'personal template',
            );
            expect(await Deno.readTextFile(join(f.root, 'unrelated'))).toBe('keep');

            await Deno.writeTextFile(join(f.root, 'instructions/a.md'), 'conflict');
            const conflict = await f.run(['--non-interactive', '--no-color']);
            expect(conflict.code).not.toBe(0);
            expect((await f.calls()).length).toBe(4);
            expect(await Deno.readTextFile(join(f.root, 'instructions/a.md'))).toBe('conflict');
            await Deno.remove(join(f.root, 'instructions/a.md'));
            const failed = await f.run(['--non-interactive'], { FAIL_CLI: '1' });
            expect(failed.code).not.toBe(0);
            expect(failed.output).toContain('fixture network failure');
            expect((await f.calls()).length).toBe(4);

            // Feed install.sh over stdin while consent is read from the controlling terminal.
            const python = `
import errno, os, pty, select, signal, sys, time
pid, master = pty.fork()
if pid == 0:
    os.execv('/bin/sh', ['sh', '-c', 'cat "$1" | /bin/sh', 'sh', sys.argv[1]])
transcript = b''
answered = False
reaped = False
try:
    deadline = time.monotonic() + 30
    while True:
        remaining = deadline - time.monotonic()
        assert remaining > 0 and select.select([master], [], [], remaining)[0], transcript
        try:
            chunk = os.read(master, 65536)
        except OSError as error:
            if error.errno != errno.EIO:
                raise
            break
        if not chunk:
            break
        transcript += chunk
        if b'[y/N]' in transcript and not answered:
            os.write(master, b'yes\\n')
            answered = True
    _, status = os.waitpid(pid, 0)
    reaped = True
    assert status == 0, transcript
    assert answered, transcript
    assert b'new shell' in transcript, transcript
    sys.stdout.buffer.write(transcript)
finally:
    if not reaped:
        os.killpg(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    os.close(master)
`;
            const lookup = await new Deno.Command('/bin/sh', {
                args: ['-c', 'command -v python3'],
                stdout: 'piped',
            }).output();
            expect(lookup.success).toBe(true);
            const pythonPath = decoder.decode(lookup.stdout).trim();
            const interactive = await new Deno.Command(pythonPath, {
                args: ['-c', python, installer],
                cwd: f.home,
                env: f.env,
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            expect(interactive.success, decoder.decode(interactive.stderr)).toBe(true);
            const profile = await Deno.readTextFile(join(f.home, '.bashrc'));
            expect(profile).toContain(`${f.root}/bin`);
            expect(profile).not.toContain('libexec');

            // A separate root gets a fresh installation; a failed profile edit is nonfatal.
            await Deno.remove(join(f.home, '.bashrc'));
            await Deno.mkdir(join(f.home, '.bashrc'));
            const alternate = join(f.temporary, 'alternate root');
            f.env.CODERAIL_INSTALL_ROOT = alternate;
            const second = await new Deno.Command(pythonPath, {
                args: ['-c', python, installer],
                cwd: f.home,
                env: f.env,
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            expect(second.success, decoder.decode(second.stderr)).toBe(true);
            expect(decoder.decode(second.stdout)).toContain('Could not configure PATH');
            expect(decoder.decode(second.stdout)).toContain('export PATH=');
            expect((await Deno.stat(join(alternate, 'bin/cr'))).isFile).toBe(true);
            expect(await Deno.readTextFile(join(f.root, 'templates/personal.md'))).toBe(
                'personal template',
            );
            expect((await f.calls()).length).toBe(8);
            await f.clean();
        });
    },
});
