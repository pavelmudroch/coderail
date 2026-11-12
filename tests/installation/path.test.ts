import { expect } from '@std/expect';
import { join } from '@std/path';

import { setupPath, terminalConfirm } from '../../src/installation/path.ts';

Deno.test('PATH setup preserves shell files, quotes paths and is idempotent', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
        const home = await Deno.makeTempDir();
        try {
            const bin = join(home, "install space's", 'bin');
            const messages: string[] = [];
            const options = {
                bin,
                home,
                shell,
                path: '/usr/bin',
                os: 'linux',
                confirm: () => true,
                report: (message: string) => messages.push(message),
            };
            const file =
                shell === 'fish'
                    ? join(home, '.config/fish/config.fish')
                    : join(home, shell === 'bash' ? '.bashrc' : '.zshrc');
            await Deno.mkdir(join(file, '..'), { recursive: true });
            await Deno.writeTextFile(file, '# existing\n');
            await setupPath(options);
            const content = await Deno.readTextFile(file);
            expect(content).toContain('# existing\n');
            expect(content).toContain('install space');
            expect(content).not.toContain('libexec');
            await setupPath(options);
            expect(await Deno.readTextFile(file)).toBe(content);
            expect(messages.join('\n')).toContain('shell');
        } finally {
            await Deno.remove(home, { recursive: true });
        }
    }
});

Deno.test('PATH setup requires consent and provides manual guidance', async () => {
    const home = await Deno.makeTempDir();
    try {
        const bin = join(home, 'custom root', 'bin');
        for (const confirm of [undefined, () => false]) {
            const messages: string[] = [];
            await setupPath({
                bin,
                home,
                shell: 'bash',
                path: '/usr/bin',
                os: 'linux',
                confirm,
                report: (message) => messages.push(message),
            });
            expect(messages.join('\n')).toContain('export PATH=');
            await expect(Deno.stat(join(home, '.bashrc'))).rejects.toThrow();
        }
        let prompts = 0;
        await setupPath({
            bin,
            home,
            shell: 'bash',
            path: `/usr/bin:${bin}`,
            os: 'linux',
            confirm: () => {
                prompts++;
                return true;
            },
            report: () => {},
        });
        expect(prompts).toBe(0);
        const messages: string[] = [];
        await setupPath({
            bin,
            home,
            shell: 'unknown',
            path: '',
            os: 'linux',
            confirm: () => {
                prompts++;
                return true;
            },
            report: (message) => messages.push(message),
        });
        expect(prompts).toBe(0);
        expect(messages.join('\n')).toContain(bin);
    } finally {
        await Deno.remove(home, { recursive: true });
    }
});

Deno.test('Windows PATH setup preserves user entries and handles transport failures', async () => {
    const messages: string[] = [];
    let value = 'C:\\Existing';
    const windows = {
        read: () => Promise.resolve(value),
        write: (next: string) => {
            value = next;
            return Promise.resolve();
        },
    };
    const options = {
        bin: 'C:\\Program Files\\Coderail\\bin',
        home: '',
        shell: '',
        path: '',
        os: 'windows',
        confirm: () => true,
        report: (message: string) => messages.push(message),
        windows,
    };
    await setupPath(options);
    expect(value).toBe('C:\\Existing;C:\\Program Files\\Coderail\\bin');
    await setupPath(options);
    expect(value).toBe('C:\\Existing;C:\\Program Files\\Coderail\\bin');
    await setupPath({
        ...options,
        windows: { ...windows, read: () => Promise.reject(new Error('denied')) },
    });
    expect(messages.join('\n')).toContain('denied');
    expect(messages.join('\n')).toContain('PowerShell');
});

Deno.test('PATH setup creates configs and reports filesystem failures', async () => {
    const home = await Deno.makeTempDir();
    const messages: string[] = [];
    const options = {
        bin: '/custom/bin',
        home,
        shell: 'bash',
        path: '',
        os: 'linux',
        confirm: () => true,
        report: (message: string) => messages.push(message),
    };
    try {
        await setupPath(options);
        expect(await Deno.readTextFile(join(home, '.bashrc'))).toContain('/custom/bin');
        await Deno.writeTextFile(join(home, '.bashrc'), '# no newline');
        await setupPath(options);
        expect(await Deno.readTextFile(join(home, '.bashrc'))).toContain('# no newline\n');
        await setupPath({ ...options, home: '' });
        expect(messages.join('\n')).toContain('Home directory is unavailable');
        await Deno.remove(join(home, '.bashrc'));
        await Deno.mkdir(join(home, '.bashrc'));
        await setupPath(options);
        expect(messages.join('\n')).toContain('Could not configure PATH');
        await setupPath({
            ...options,
            home: join(home, '.bashrc', 'missing'),
            confirm: () => {
                throw new Error('prompt failed');
            },
        });
        expect(messages.join('\n')).toContain('prompt failed');
    } finally {
        await Deno.remove(home, { recursive: true });
    }
});

Deno.test('default Windows transport writes only user PATH and reports errors', async () => {
    const Command = Deno.Command;
    let current = '';
    let failure: string | undefined;
    const scripts: string[] = [];
    Deno.Command = class {
        constructor(_command: string | URL, options: Deno.CommandOptions) {
            scripts.push(options.args?.join(' ') ?? '');
            if (options.env?.CODERAIL_USER_PATH) {
                current = options.env.CODERAIL_USER_PATH;
            }
        }
        output(): Promise<{ success: boolean; stdout: Uint8Array; stderr: Uint8Array }> {
            return Promise.resolve({
                success: failure === undefined,
                stdout: new TextEncoder().encode(current + '\r\n'),
                stderr: new TextEncoder().encode(failure ?? ''),
            });
        }
    } as unknown as typeof Deno.Command;
    const messages: string[] = [];
    const options = {
        bin: 'C:\\Custom\\bin',
        home: '',
        shell: '',
        path: '',
        os: 'windows',
        confirm: () => true,
        report: (message: string) => messages.push(message),
    };
    try {
        await setupPath(options);
        expect(current).toBe(options.bin);
        expect(scripts.every((script) => script.includes('"User"'))).toBe(true);
        failure = 'access denied';
        await setupPath(options);
        failure = '';
        await setupPath(options);
        expect(messages.join('\n')).toContain('access denied');
        expect(messages.join('\n')).toContain('PowerShell failed');
        let prompts = 0;
        await setupPath({
            ...options,
            path: 'c:/custom/bin/',
            confirm: () => {
                prompts++;
                return true;
            },
        });
        expect(prompts).toBe(0);
    } finally {
        Deno.Command = Command;
    }
});

Deno.test('terminal confirmation defaults to decline and closes its terminal', () => {
    const open = Deno.openSync;
    const opened: (string | URL)[] = [];
    let closed = 0;
    let answer: number[] = [];
    Deno.openSync = ((path: string | URL) => {
        opened.push(path);
        return {
            writeSync: (data: Uint8Array) => data.length,
            readSync: (data: Uint8Array) => {
                const next = answer.shift();
                if (next === undefined) {
                    return null;
                }
                data[0] = next;
                return 1;
            },
            close: () => {
                closed++;
            },
        };
    }) as unknown as typeof Deno.openSync;
    try {
        for (const [input, expected] of [
            ['yes\n', true],
            ['n\n', false],
            ['', false],
        ] as const) {
            answer = Array.from(new TextEncoder().encode(input));
            expect(terminalConfirm('Consent?', 'linux')).toBe(expected);
        }
        expect(terminalConfirm('Consent?', 'windows')).toBe(false);
        expect(opened).toEqual(['/dev/tty', '/dev/tty', '/dev/tty', 'CON']);
        expect(closed).toBe(4);
        Deno.openSync = () => {
            throw new Error('no terminal');
        };
        expect(terminalConfirm('Consent?')).toBe(false);
    } finally {
        Deno.openSync = open;
    }
});

Deno.test(
    'PATH defaults tolerate unavailable environment values on supported platforms',
    async () => {
        const get = Deno.env.get;
        const requested: string[] = [];
        Deno.env.get = (name) => {
            requested.push(name);
            return undefined;
        };
        try {
            for (const os of ['windows', 'linux']) {
                const messages: string[] = [];
                await setupPath({
                    bin: '/custom/bin',
                    os,
                    report: (message) => messages.push(message),
                });
                expect(messages.length).toBe(1);
                expect(requested).toContain(os === 'windows' ? 'USERPROFILE' : 'HOME');
                expect(requested).not.toContain(os === 'windows' ? 'HOME' : 'USERPROFILE');
                requested.length = 0;
            }
            await setupPath({ bin: '/custom/bin', report: () => {} });
            Deno.env.get = (name) =>
                ({ HOME: '/home/example', SHELL: '/bin/bash', PATH: '/custom/bin' })[
                    name as 'HOME' | 'SHELL' | 'PATH'
                ];
            await setupPath({ bin: '/custom/bin', report: () => {} });
        } finally {
            Deno.env.get = get;
        }
    },
);
