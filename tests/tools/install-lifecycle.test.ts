import { expect } from '@std/expect';
import { join } from '@std/path';

import { executable, fixture } from './install-fixture.ts';

Deno.test(
    'installer maps supported hosts, pins bootstrap and cleans temporary downloads',
    async () => {
        for (const [os, arch, target] of [
            ['Linux', 'x86_64', 'x86_64-unknown-linux-gnu'],
            ['Linux', 'aarch64', 'aarch64-unknown-linux-gnu'],
            ['Darwin', 'amd64', 'x86_64-apple-darwin'],
            ['Darwin', 'arm64', 'aarch64-apple-darwin'],
        ] as const) {
            await fixture(async (f) => {
                await f.archive(target);
                const result = await f.run([], { HOST_OS: os, HOST_ARCH: arch });
                expect(result.code, result.output).toBe(0);
                const calls = await f.calls();
                expect(calls.length).toBe(4);
                expect(calls.filter((url) => url.endsWith('/latest')).length).toBe(1);
                expect(calls[1]).toContain('/releases/7/assets?');
                const invocations = await f.calls(f.invocations);
                expect(invocations.slice(1)).toEqual(['upgrade', '--version', '2.10.0']);
                expect(invocations[0]).toMatch(/selected root\/libexec\/cr-bootstrap\.[^/]+$/);
                expect(await Deno.readLink(join(f.root, 'bin/cr'))).toBe(invocations[0]);
                await f.clean();
            });
        }
    },
);

Deno.test(
    'installer diagnoses unsupported hosts and absent prerequisites without downloads',
    async () => {
        for (const env of [
            { HOST_OS: 'FreeBSD', HOST_ARCH: 'x86_64' },
            { HOST_OS: 'Linux', HOST_ARCH: 'riscv64' },
        ]) {
            await fixture(async (f) => {
                const result = await f.run([], env);
                expect(result.code).toBe(1);
                expect(result.output).toContain('Unsupported');
                expect(await f.calls()).toEqual([]);
            });
        }
        for (const tool of ['jq', 'unzip', 'curl', 'shasum']) {
            await fixture(async (f) => {
                await Deno.remove(join(f.tools, tool));
                const result = await f.run();
                expect(result.code).toBe(1);
                expect(result.output).toContain('Required');
                expect(await f.calls()).toEqual([]);
            });
        }
    },
);

Deno.test(
    'installer rejects absent, malformed, canary and unstable latest before execution',
    async () => {
        for (const release of [
            { tag_name: 'canary' },
            { tag_name: 'v1.2.3-beta' },
            { tag_name: '01.2.3' },
            { tag_name: '1.2' },
            { draft: true },
            { prerelease: true },
            { id: 0 },
            { target_commitish: 'main' },
        ]) {
            await fixture(async (f) => {
                await f.release(release);
                const result = await f.run();
                expect(result.code).toBe(1);
                expect(result.output).toContain('Invalid latest stable release');
                expect(await f.calls(f.invocations)).toEqual([]);
                await f.clean();
            });
        }
        await fixture(async (f) => {
            await Deno.writeTextFile(join(f.temporary, 'release'), 'not JSON');
            expect((await f.run()).code).toBe(1);
            await f.clean();
        });
    },
);

Deno.test(
    'installer stops download, checksum and extraction failures before executing code',
    async () => {
        for (const failure of [
            'release',
            'assets',
            'archive',
            'checksum',
            'digest',
            'extract',
            'asset',
        ]) {
            await fixture(async (f) => {
                if (failure === 'digest') {
                    await Deno.writeTextFile(join(f.temporary, 'checksum'), 'bad');
                }
                if (failure === 'extract') {
                    await executable(join(f.tools, 'unzip'), 'exit 9');
                }
                if (failure === 'asset') {
                    await Deno.writeTextFile(join(f.temporary, 'assets'), '[]');
                }
                const result = await f.run([], { FAIL_DOWNLOAD: failure });
                expect(result.code).not.toBe(0);
                expect(await f.calls(f.invocations)).toEqual([]);
                await f.clean();
                const files = [...Deno.readDirSync(f.root)].map((file) => file.name);
                if (files.includes('libexec')) {
                    expect([...Deno.readDirSync(join(f.root, 'libexec'))]).toEqual([]);
                }
            });
        }
    },
);

Deno.test(
    'healthy reruns delegate once, preserve status and never bootstrap after upgrade failure',
    async () => {
        for (const status of [0, 17]) {
            await fixture(async (f) => {
                await Deno.mkdir(join(f.root, 'bin'), { recursive: true });
                await Deno.mkdir(join(f.root, 'libexec'));
                const existing = join(f.root, 'libexec/cr-existing');
                await executable(
                    existing,
                    `
if [ "$1" = --version ]; then echo 'Coderail version 1.0.0'; exit 0; fi
printf '%s\\n' "$@" >> "$FIXTURE/invocations"
echo 'existing upgrade diagnostic'
exit ${status}`,
                );
                await Deno.symlink('../libexec/cr-existing', join(f.root, 'bin/cr'));
                // Bootstrap-only prerequisites must not be needed on a valid rerun.
                await Deno.remove(join(f.tools, 'jq'));
                const result = await f.run(['--non-interactive']);
                expect(result.code).toBe(status);
                expect(result.output).toContain('existing upgrade diagnostic');
                expect(await f.calls()).toEqual([]);
                expect(await f.calls(f.invocations)).toEqual([
                    '--non-interactive',
                    'upgrade',
                    '--version',
                    'latest',
                ]);
                expect(await Deno.readLink(join(f.root, 'bin/cr'))).toBe('../libexec/cr-existing');
            });
        }
    },
);

Deno.test(
    'default, broken and alternate roots preserve existing data and select their own root',
    async () => {
        for (const state of ['default', 'missing-target', 'broken', 'foreign']) {
            await fixture(async (f) => {
                const selected = state === 'default' ? join(f.home, '.coderail') : f.root;
                await Deno.mkdir(join(selected, 'bin'), { recursive: true });
                await Deno.mkdir(join(selected, 'libexec'));
                await Deno.mkdir(join(selected, 'templates'));
                await Deno.writeTextFile(join(selected, 'templates/personal.md'), 'user data');
                await Deno.writeTextFile(join(selected, 'unrelated'), 'keep');
                if (state === 'missing-target') {
                    await Deno.symlink('../libexec/missing', join(selected, 'bin/cr'));
                }
                if (state === 'broken') {
                    await executable(join(selected, 'libexec/broken'), 'exit 126');
                    await Deno.symlink('../libexec/broken', join(selected, 'bin/cr'));
                }
                if (state === 'foreign') {
                    await executable(join(f.temporary, 'foreign'), 'exit 99');
                    await Deno.symlink(join(f.temporary, 'foreign'), join(selected, 'bin/cr'));
                }
                const result = await f.run(
                    [],
                    state === 'default' ? { CODERAIL_INSTALL_ROOT: '' } : {},
                );
                expect(result.code, result.output).toBe(0);
                expect((await f.calls(f.invocations))[0]).toContain(`${selected}/libexec/`);
                expect(await Deno.readTextFile(join(selected, 'templates/personal.md'))).toBe(
                    'user data',
                );
                expect(await Deno.readTextFile(join(selected, 'unrelated'))).toBe('keep');
                if (state === 'foreign') {
                    expect(await Deno.readTextFile(join(f.temporary, 'foreign'))).toContain(
                        'exit 99',
                    );
                }
                await f.clean();
            });
        }
    },
);

Deno.test('failed and interrupted bootstrap cleans only unused installer files', async () => {
    for (const state of [
        'before',
        'active',
        'active-relative',
        'owned',
        'signal',
        'hup',
        'interrupt',
    ]) {
        await fixture(async (f) => {
            await f.bootstrap(`
root=$(dirname "$(dirname "$0")")
echo partial > "$root/partial"
case ${state} in
active) mkdir -p "$root/bin"; ln -s "$0" "$root/bin/cr";;
active-relative) mkdir -p "$root/bin"; ln -s "../libexec/./$(basename "$0")" "$root/bin/cr";;
owned) printf '{"files":[{"path":"libexec/%s"}]}' "$(basename "$0")" > "$root/.coderail-distribution.json";;
signal) kill -TERM "$PPID";;
hup) kill -HUP "$PPID";;
interrupt) kill -INT "$PPID";;
esac
exit 19`);
            const result = await f.run();
            const status =
                state === 'signal' ? 143 : state === 'hup' ? 129 : state === 'interrupt' ? 130 : 19;
            expect(result.code).toBe(status);
            expect(await Deno.readTextFile(join(f.root, 'partial'))).toBe('partial\n');
            expect([...Deno.readDirSync(join(f.root, 'libexec'))].length).toBe(
                state === 'active' || state === 'active-relative' || state === 'owned' ? 1 : 0,
            );
            await f.clean();
        });
    }
});
