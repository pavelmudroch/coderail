import { expect } from '@std/expect';
import { join } from '@std/path';

import { run, select } from '../../src/templates/startup.ts';

Deno.test(
    'startup selection prefers only the matching platform script then TypeScript',
    async () => {
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        try {
            for (const platform of ['linux', 'darwin', 'windows'] as const) {
                const native = platform === 'windows' ? 'startup.ps1' : 'startup.sh';
                const other = platform === 'windows' ? 'startup.sh' : 'startup.ps1';
                expect(await select(root, platform, signal)).toBeUndefined();
                await Deno.writeTextFile(join(root, other), '');
                expect(await select(root, platform, signal)).toBeUndefined();
                await Deno.writeTextFile(join(root, 'startup.ts'), '');
                expect(await select(root, platform, signal)).toBe(join(root, 'startup.ts'));
                await Deno.writeTextFile(join(root, native), '');
                expect(await select(root, platform, signal)).toBe(join(root, native));
                for (const name of [native, other, 'startup.ts']) {
                    await Deno.remove(join(root, name));
                }
            }
            await expect(select(root, 'linux', AbortSignal.abort())).rejects.toThrow();
            await Deno.mkdir(join(root, 'startup.sh'));
            await expect(select(root, 'linux', signal)).rejects.toThrow('startup.sh');
            await expect(select(join(root, 'missing'), 'linux', signal)).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'startup runs native and TypeScript scripts in the target root and rejects failures',
    async () => {
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        const native = Deno.build.os === 'windows' ? 'startup.ps1' : 'startup.sh';
        try {
            for (const [name, content] of [
                [
                    native,
                    Deno.build.os === 'windows'
                        ? 'Set-Content -NoNewline effect native'
                        : 'printf native > effect',
                ],
                ['startup.ts', "await Deno.writeTextFile('effect', Deno.cwd());"],
            ] as const) {
                const path = join(root, name);
                await Deno.writeTextFile(path, content);
                await run(path, root, signal);
                expect(await Deno.readTextFile(join(root, 'effect'))).toBe(
                    name === native ? 'native' : root,
                );
            }
            const path = join(root, 'startup.ts');
            await Deno.writeTextFile(path, 'Deno.exit(23);');
            await expect(run(path, root, signal)).rejects.toThrow('23');
            await expect(run(path, root, AbortSignal.abort())).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'startup reports missing interpreters and uses the intended commands and inherited streams',
    async () => {
        const Command = Deno.Command;
        const root = await Deno.makeTempDir();
        try {
            for (const [name, executable, args] of [
                ['startup.sh', 'sh', []],
                ['startup.ps1', 'pwsh', ['-File']],
                ['startup.ts', 'deno', ['run', '-A']],
            ] as const) {
                const path = join(root, name);
                Deno.Command = class extends Command {
                    constructor(command: string | URL, options?: Deno.CommandOptions) {
                        expect(command).toBe(executable);
                        expect(options).toEqual({
                            args: [...args, path],
                            cwd: root,
                            stdin: 'inherit',
                            stdout: 'inherit',
                            stderr: 'inherit',
                            signal,
                        });
                        super(command, options);
                    }
                    override spawn(): Deno.ChildProcess {
                        throw new Deno.errors.NotFound('missing interpreter');
                    }
                };
                const signal = new AbortController().signal;
                await expect(run(path, root, signal)).rejects.toThrow('missing interpreter');
            }
        } finally {
            Deno.Command = Command;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('startup selection propagates cancellation during directory reads', async () => {
    const readDir = Deno.readDir;
    const controller = new AbortController();
    try {
        Deno.readDir = async function* () {
            controller.abort(new Error('cancelled selection'));
            yield { name: 'startup.ts', isFile: true, isDirectory: false, isSymlink: false };
        };
        await expect(select('/unused', 'linux', controller.signal)).rejects.toThrow(
            'cancelled selection',
        );
    } finally {
        Deno.readDir = readDir;
    }
});

Deno.test('startup propagates cancellation even when the child has just succeeded', async () => {
    const Command = Deno.Command;
    const root = await Deno.makeTempDir();
    const controller = new AbortController();
    try {
        const path = join(root, 'startup.ts');
        await Deno.writeTextFile(path, '');
        Deno.Command = class extends Command {
            override spawn(): Deno.ChildProcess {
                const child = super.spawn();
                void child.status.then(() => controller.abort(new Error('cancelled completion')));
                return child;
            }
        };
        await expect(run(path, root, controller.signal)).rejects.toThrow('cancelled completion');
    } finally {
        Deno.Command = Command;
        await Deno.remove(root, { recursive: true });
    }
});
