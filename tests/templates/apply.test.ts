import { Conf } from '@conf';
import { Fs } from '@fs';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { ProjectInitialization } from '../../src/project/initialization.ts';
import { type ApplyOptions, Templates } from '../../src/templates.ts';

async function fixture(): Promise<{ root: string; options: ApplyOptions; path: string }> {
    const root = await Deno.makeTempDir();
    const options: ApplyOptions = {
        installRoot: join(root, 'install'),
        projectRoot: join(root, 'project'),
        names: ['first'],
        mode: 'apply',
        overwrite: 'error',
        signal: new AbortController().signal,
    };
    const info = await Templates.create(options.installRoot, 'first', '', options.signal);
    await ProjectInitialization.initialize({ ...options, names: [] });
    return { root, options, path: info.path };
}

Deno.test(
    'application merges nested assets and independent config documents in name order',
    async () => {
        const { root, options, path } = await fixture();
        try {
            const second = await Templates.create(
                options.installRoot,
                'second',
                '',
                options.signal,
            );
            await Deno.mkdir(join(path, 'assets', 'nested'));
            await Deno.writeFile(
                join(path, 'assets', 'nested', 'file'),
                new Uint8Array([0, 255, 3]),
            );
            await Deno.mkdir(join(options.projectRoot, 'nested'));
            await Deno.writeTextFile(join(options.projectRoot, 'keep'), 'existing');
            await Deno.writeTextFile(
                join(options.projectRoot, '.coderail', 'config'),
                '# local\ndefault_harness = "old"\n[verify]\npre = [["one"]]\n',
            );
            await Deno.writeTextFile(
                join(path, 'config'),
                '# first\ndefault_harness = "first"\n[verify]\npre = [["one"], ["two"]]\n',
            );
            await Deno.writeTextFile(
                join(second.path, 'config'),
                '# second\ndefault_harness = "second"\n',
            );
            const report = await Templates.apply({ ...options, names: ['first', 'second'] });
            expect(report.conflicts).toEqual([]);
            expect(report.actions.map((a) => a.kind)).toEqual([
                'skip',
                'copy',
                'merge-config',
                'merge-config',
            ]);
            expect(report.actions[1]?.path).toBe(join(options.projectRoot, 'nested', 'file'));
            expect(await Deno.readFile(join(options.projectRoot, 'nested', 'file'))).toEqual(
                new Uint8Array([0, 255, 3]),
            );
            expect(await Deno.readTextFile(join(options.projectRoot, 'keep'))).toBe('existing');
            const config = join(options.projectRoot, '.coderail', 'config');
            const parsed = await Conf.parse(new Blob([await Deno.readTextFile(config)]).stream());
            expect(parsed.toObject()).toEqual({
                defaultHarness: 'second',
                verify: { pre: [['one'], ['two']] },
            });
            expect(parsed.getComments().get('defaultHarness')).toEqual([
                'local',
                'first',
                'second',
            ]);
            const repeated = await Templates.apply({ ...options, names: ['first', 'second'] });
            expect(repeated.actions.map((a) => a.kind)).toEqual([
                'skip',
                'skip',
                'merge-config',
                'merge-config',
            ]);
            expect(
                (await Conf.parse(new Blob([await Deno.readTextFile(config)]).stream())).toObject(),
            ).toEqual(parsed.toObject());
            expect(await Templates.apply({ ...options, names: [] })).toEqual({
                actions: [],
                conflicts: [],
            });
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'preflight conflicts and invalid templates leave all template assets and config untouched',
    async () => {
        for (const failure of [
            'different',
            'size',
            'file-directory',
            'directory-file',
            'target-link',
            'source-link',
            'settings',
            'syntax',
            'layout',
            'project-config',
        ]) {
            const { root, options, path } = await fixture();
            try {
                await Deno.writeTextFile(
                    join(path, 'startup.ts'),
                    "await Deno.writeTextFile('started', 'yes');",
                );
                const config = join(options.projectRoot, '.coderail', 'config');
                if (failure === 'project-config') {
                    await Deno.writeTextFile(config, 'no_color = 4');
                }
                const original = await Deno.readTextFile(config);
                await Deno.writeTextFile(join(path, 'assets', 'a-new'), 'must not copy');
                await Deno.writeTextFile(join(path, 'config'), 'no_color = true');
                const source = join(path, 'assets', 'z-conflict');
                const target = join(options.projectRoot, 'z-conflict');
                if (failure === 'directory-file') {
                    await Deno.mkdir(source);
                    await Deno.writeTextFile(target, 'existing');
                } else if (failure === 'source-link') {
                    await Deno.symlink(config, source);
                } else if (['settings', 'syntax'].includes(failure)) {
                    await Deno.writeTextFile(
                        join(path, 'config'),
                        failure === 'settings' ? 'no_color = "bad"' : 'broken',
                    );
                } else if (failure === 'layout') {
                    await Deno.remove(join(path, 'template'));
                } else if (failure !== 'project-config') {
                    await Deno.writeTextFile(source, 'new');
                    if (failure === 'file-directory') {
                        await Deno.mkdir(target);
                    } else if (failure === 'target-link') {
                        await Deno.symlink(config, target);
                    } else {
                        await Deno.writeTextFile(target, failure === 'size' ? 'longer' : 'old');
                    }
                }
                await expect(Templates.apply(options)).rejects.toThrow(
                    'Cannot apply template "first"',
                );
                await expect(Deno.lstat(join(options.projectRoot, 'a-new'))).rejects.toBeInstanceOf(
                    Deno.errors.NotFound,
                );
                expect(await Deno.readTextFile(config)).toBe(original);
                await expect(Deno.stat(join(options.projectRoot, 'started'))).rejects.toThrow();
            } finally {
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test(
    'later failures preserve earlier applications and stop subsequent templates',
    async () => {
        const { root, options, path } = await fixture();
        try {
            await Deno.writeTextFile(join(path, 'assets', 'first'), 'applied');
            await Deno.writeTextFile(join(path, 'config'), 'no_color = true');
            const last = await Templates.create(options.installRoot, 'last', '', options.signal);
            await Deno.writeTextFile(join(last.path, 'assets', 'last'), 'not applied');
            await expect(
                Templates.apply({ ...options, names: ['first', 'missing', 'last'] }),
            ).rejects.toThrow('"missing"');
            expect(await Deno.readTextFile(join(options.projectRoot, 'first'))).toBe('applied');
            expect(
                await Deno.readTextFile(join(options.projectRoot, '.coderail', 'config')),
            ).toContain('no_color = true');
            await expect(Deno.lstat(join(options.projectRoot, 'last'))).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('application rejects cancellation without writes', async () => {
    const { root, options } = await fixture();
    try {
        for (const overrides of [{ signal: AbortSignal.abort() }]) {
            await expect(Templates.apply({ ...options, ...overrides })).rejects.toThrow();
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'I/O failures and cancellation between copies preserve partial work and stop configuration writes',
    async () => {
        for (const cancel of [false, true]) {
            const { root, options, path } = await fixture();
            const copy = Deno.copyFile;
            const controller = new AbortController();
            try {
                const config = join(options.projectRoot, '.coderail', 'config');
                const original = await Deno.readTextFile(config);
                await Deno.writeTextFile(join(path, 'assets', 'a'), 'one');
                await Deno.writeTextFile(join(path, 'assets', 'b'), 'two');
                Deno.copyFile = async (from, to) => {
                    if (String(to).endsWith('/b')) {
                        throw new Error('disk failure');
                    }
                    await copy(from, to);
                    if (cancel) {
                        controller.abort();
                    }
                };
                await expect(
                    Templates.apply({ ...options, signal: controller.signal }),
                ).rejects.toThrow();
                expect(await Deno.readTextFile(join(options.projectRoot, 'a'))).toBe('one');
                await expect(Deno.lstat(join(options.projectRoot, 'b'))).rejects.toThrow();
                expect(await Deno.readTextFile(config)).toBe(original);
            } finally {
                Deno.copyFile = copy;
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test('preflight propagates destination stat errors', async () => {
    const { root, options, path } = await fixture();
    const lstat = Deno.lstat;
    try {
        await Deno.writeTextFile(join(path, 'assets', 'blocked'), 'data');
        Deno.lstat = (target) =>
            String(target) === join(options.projectRoot, 'blocked')
                ? Promise.reject(new Error('stat failure'))
                : lstat(target);
        await expect(Templates.apply(options)).rejects.toThrow();
    } finally {
        Deno.lstat = lstat;
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'application creates absent directory trees and skips empty identical files',
    async () => {
        const { root, options, path } = await fixture();
        try {
            await Deno.mkdir(join(path, 'assets', 'new', 'nested'), { recursive: true });
            await Deno.writeTextFile(join(path, 'assets', 'new', 'nested', 'empty'), '');
            const first = await Templates.apply(options);
            expect(first.actions.map((a) => a.kind)).toEqual([
                'copy',
                'copy',
                'copy',
                'merge-config',
            ]);
            expect(
                await Deno.readTextFile(join(options.projectRoot, 'new', 'nested', 'empty')),
            ).toBe('');
            const second = await Templates.apply(options);
            expect(second.actions.map((a) => a.kind)).toEqual([
                'skip',
                'skip',
                'skip',
                'merge-config',
            ]);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('startup consumes copied assets and merged config before the next template', async () => {
    const { root, options, path } = await fixture();
    try {
        const second = await Templates.create(options.installRoot, 'second', '', options.signal);
        await Deno.writeTextFile(join(path, 'assets', 'input'), 'copied');
        await Deno.writeTextFile(join(path, 'config'), 'default_harness = "first"');
        await Deno.writeTextFile(
            join(path, 'startup.ts'),
            `
            const config = await Deno.readTextFile('.coderail/config');
            if (!config.includes('default_harness = "first"')) throw new Error('config unavailable');
            await Deno.writeTextFile('output', await Deno.readTextFile('input'));
            await Deno.writeTextFile('.coderail/config', config + '\\nno_color = true\\n');
        `,
        );
        await Deno.writeTextFile(join(second.path, 'config'), 'default_harness = "second"');
        await Deno.writeTextFile(join(second.path, 'assets', 'output'), 'copied');
        await Deno.writeTextFile(
            join(second.path, 'startup.ts'),
            `
            const config = await Deno.readTextFile('.coderail/config');
            if (!config.includes('no_color = true') || !config.includes('default_harness = "second"')) {
                throw new Error('prior startup or merge incomplete');
            }
            await Deno.writeTextFile('output', (await Deno.readTextFile('output')) + '-second');
        `,
        );
        const report = await Templates.apply({ ...options, names: ['first', 'second'] });
        expect(await Deno.readTextFile(join(options.projectRoot, 'output'))).toBe('copied-second');
        expect(report.actions.map((a) => a.kind)).toEqual([
            'copy',
            'merge-config',
            'startup',
            'skip',
            'merge-config',
            'startup',
        ]);
        expect(report.actions.filter((a) => a.kind === 'startup').map((a) => a.path)).toEqual([
            join(path, 'startup.ts'),
            join(second.path, 'startup.ts'),
        ]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('copy and config write failures prevent startup', async () => {
    for (const failure of ['copy', 'config']) {
        const { root, options, path } = await fixture();
        const copy = Deno.copyFile;
        const write = Fs.write;
        try {
            await Deno.writeTextFile(join(path, 'assets', 'input'), 'copied');
            await Deno.writeTextFile(
                join(path, 'startup.ts'),
                "await Deno.writeTextFile('started', 'yes');",
            );
            if (failure === 'copy') {
                Deno.copyFile = () => Promise.reject(new Error('copy failed'));
            } else {
                Fs.write = () => Promise.reject(new Error('config failed'));
            }
            await expect(Templates.apply(options)).rejects.toThrow('Cannot apply template');
            await expect(Deno.stat(join(options.projectRoot, 'started'))).rejects.toThrow();
        } finally {
            Deno.copyFile = copy;
            Fs.write = write;
            await Deno.remove(root, { recursive: true });
        }
    }
});

Deno.test(
    'startup failure and cancellation preserve changes and block later templates',
    async () => {
        for (const cancel of [false, true]) {
            const { root, options, path } = await fixture();
            const controller = new AbortController();
            let pid: number | undefined;
            let pending: Promise<unknown> | undefined;
            try {
                const later = await Templates.create(
                    options.installRoot,
                    'later',
                    '',
                    options.signal,
                );
                await Deno.writeTextFile(join(later.path, 'config'), 'no_color = false');
                await Deno.writeTextFile(join(path, 'assets', 'input'), 'copied');
                await Deno.writeTextFile(join(path, 'config'), 'no_color = true');
                await Deno.writeTextFile(
                    join(path, 'startup.ts'),
                    `
                await Deno.writeTextFile('pid', String(Deno.pid));
                ${cancel ? 'setInterval(() => {}, 1000);' : 'Deno.exit(17);'}
            `,
                );
                const operation = Templates.apply({
                    ...options,
                    names: ['first', 'later'],
                    signal: controller.signal,
                });
                // Attach rejection handling immediately, including if startup unexpectedly fails early.
                pending = expect(operation).rejects.toThrow('Cannot apply template "first"');
                if (cancel) {
                    const deadline = Date.now() + 10000;
                    while (true) {
                        try {
                            const text = await Deno.readTextFile(join(options.projectRoot, 'pid'));
                            if (/^[1-9]\d*$/.test(text)) {
                                pid = Number(text);
                                break;
                            }
                        } catch (error) {
                            if (!(error instanceof Deno.errors.NotFound) || Date.now() > deadline) {
                                throw error;
                            }
                        }
                        if (Date.now() > deadline) {
                            throw new Error('Startup did not publish its PID.');
                        }
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                    controller.abort(new Error('cancelled startup'));
                }
                await pending;
                if (pid !== undefined) {
                    const childPid = pid;
                    expect(() => Deno.kill(childPid, 0)).toThrow();
                }
                expect(await Deno.readTextFile(join(options.projectRoot, 'input'))).toBe('copied');
                expect(
                    await Deno.readTextFile(join(options.projectRoot, '.coderail', 'config')),
                ).toContain('no_color = true');
                expect(await Deno.readTextFile(join(options.projectRoot, 'pid'))).toMatch(/^\d+$/);
            } finally {
                controller.abort();
                await pending;
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test('application runs only the selected native startup script', async () => {
    const { root, options, path } = await fixture();
    try {
        await Deno.writeTextFile(join(path, 'startup.ts'), 'Deno.exit(99);');
        await Deno.writeTextFile(join(path, 'startup.sh'), 'printf native > selected');
        await Deno.writeTextFile(
            join(path, 'startup.ps1'),
            'Set-Content -NoNewline selected native',
        );
        const report = await ProjectInitialization.initialize(options);
        expect(await Deno.readTextFile(join(options.projectRoot, 'selected'))).toBe('native');
        expect(report.actions.at(-1)).toEqual({
            kind: 'startup',
            path: join(path, Deno.build.os === 'windows' ? 'startup.ps1' : 'startup.sh'),
            details: 'first',
        });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'overwrite answers are collected before writes and declines allow remaining work',
    async () => {
        for (const answers of [
            [true, true],
            [false, false],
            [true, false],
            [false, true],
        ]) {
            const { root, options, path } = await fixture();
            try {
                const config = join(options.projectRoot, '.coderail', 'config');
                const original = await Deno.readTextFile(config);
                const later = await Templates.create(
                    options.installRoot,
                    'later',
                    '',
                    options.signal,
                );
                await Deno.writeTextFile(join(later.path, 'assets', 'later'), 'later');
                await Deno.writeTextFile(join(path, 'config'), 'no_color = true');
                await Deno.writeTextFile(
                    join(path, 'startup.ts'),
                    "await Deno.writeTextFile('started', 'yes');",
                );
                await Deno.mkdir(join(path, 'assets', 'directory'));
                await Deno.mkdir(join(options.projectRoot, 'directory'));
                for (const name of ['a', 'b', 'identical', 'new']) {
                    await Deno.writeTextFile(join(path, 'assets', name), name);
                    if (name !== 'new') {
                        await Deno.writeTextFile(
                            join(options.projectRoot, name),
                            name === 'identical' ? name : 'old',
                        );
                    }
                }
                const calls: string[] = [];
                const report = await Templates.apply({
                    ...options,
                    names: ['first', 'later'],
                    overwrite: async (target) => {
                        expect(await Deno.readTextFile(config)).toBe(original);
                        for (const name of ['a', 'b']) {
                            expect(await Deno.readTextFile(join(options.projectRoot, name))).toBe(
                                'old',
                            );
                        }
                        await expect(Deno.stat(join(options.projectRoot, 'new'))).rejects.toThrow();
                        await expect(
                            Deno.stat(join(options.projectRoot, 'started')),
                        ).rejects.toThrow();
                        calls.push(target);
                        return answers[calls.length - 1] === true;
                    },
                });
                expect(calls).toEqual(['a', 'b'].map((name) => join(options.projectRoot, name)));
                for (const [i, name] of ['a', 'b'].entries()) {
                    expect(await Deno.readTextFile(join(options.projectRoot, name))).toBe(
                        answers[i] ? name : 'old',
                    );
                    expect(
                        report.actions.find(
                            (action) => action.path === join(options.projectRoot, name),
                        )?.kind,
                    ).toBe(answers[i] ? 'copy' : 'skip');
                }
                expect(await Deno.readTextFile(config)).toContain('no_color = true');
                for (const [name, value] of [
                    ['new', 'new'],
                    ['started', 'yes'],
                    ['later', 'later'],
                ] as const) {
                    expect(await Deno.readTextFile(join(options.projectRoot, name))).toBe(value);
                }
            } finally {
                await Deno.remove(root, { recursive: true });
            }
        }
    },
);

Deno.test('invalid layout, callback failure and abort prevent template writes', async () => {
    for (const failure of ['file-directory', 'directory-file', 'settings', 'throw', 'abort']) {
        const { root, options, path } = await fixture();
        const controller = new AbortController();
        try {
            const config = join(options.projectRoot, '.coderail', 'config');
            const original = await Deno.readTextFile(config);
            await Deno.writeTextFile(join(path, 'assets', 'a'), 'new');
            await Deno.writeTextFile(join(options.projectRoot, 'a'), 'old');
            await Deno.writeTextFile(join(path, 'assets', 'b-new'), 'copy');
            if (failure === 'file-directory') {
                await Deno.writeTextFile(join(path, 'assets', 'z'), 'file');
                await Deno.mkdir(join(options.projectRoot, 'z'));
            } else if (failure === 'directory-file') {
                await Deno.mkdir(join(path, 'assets', 'z'));
                await Deno.writeTextFile(join(options.projectRoot, 'z'), 'file');
            } else if (failure === 'settings') {
                await Deno.writeTextFile(join(path, 'config'), 'no_color = 4');
            } else {
                await Deno.writeTextFile(join(path, 'assets', 'z'), 'replacement');
                await Deno.writeTextFile(join(options.projectRoot, 'z'), 'preserved');
            }
            let calls = 0;
            await expect(
                Templates.apply({
                    ...options,
                    signal: controller.signal,
                    overwrite: () => {
                        calls++;
                        if (failure === 'throw' && calls === 2) {
                            throw new Error('answer failed');
                        }
                        if (failure === 'abort' && calls === 2) {
                            controller.abort();
                        }
                        return Promise.resolve(true);
                    },
                }),
            ).rejects.toThrow();
            expect(calls).toBe(['throw', 'abort'].includes(failure) ? 2 : 0);
            expect(await Deno.readTextFile(config)).toBe(original);
            expect(await Deno.readTextFile(join(options.projectRoot, 'a'))).toBe('old');
            await expect(Deno.stat(join(options.projectRoot, 'b-new'))).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    }
});

Deno.test(
    'preview compares sequential assets and cumulatively merges config without effects',
    async () => {
        const { root, options, path } = await fixture();
        const write = Fs.write;
        const copy = Deno.copyFile;
        const mkdir = Deno.mkdir;
        try {
            const second = await Templates.create(
                options.installRoot,
                'second',
                '',
                options.signal,
            );
            for (const [directory, scalar, commands] of [
                [path, 'first', '[ ["one"] ]'],
                [second.path, 'second', '[ ["one"], ["two"] ]'],
            ] as const) {
                await Deno.writeTextFile(
                    join(directory, 'config'),
                    `# ${scalar}\ndefault_harness = "${scalar}"\n[verify]\npre = ${commands}\n`,
                );
                await Deno.mkdir(join(directory, 'assets', 'nested'));
                await Deno.writeTextFile(join(directory, 'assets', 'nested', 'same'), 'same');
                await Deno.writeTextFile(join(directory, 'assets', 'different'), scalar);
            }
            const config = join(options.projectRoot, '.coderail', 'config');
            const before = await Deno.readTextFile(config);
            const virtual = new Map<string, Uint8Array | null>();
            Fs.write = () => {
                throw new Error('preview write');
            };
            Deno.copyFile = () => {
                throw new Error('preview copy');
            };
            Deno.mkdir = () => {
                throw new Error('preview mkdir');
            };
            const { apply } = await import('../../src/templates/apply.ts');
            const report = await apply(
                {
                    ...options,
                    names: ['first', 'second'],
                    mode: 'preview',
                    overwrite: () => {
                        throw new Error('preview prompt');
                    },
                },
                virtual,
            );
            expect(report.conflicts).toEqual([join(options.projectRoot, 'different')]);
            expect(report.actions.map((a) => a.kind)).toEqual([
                'copy',
                'copy',
                'copy',
                'merge-config',
                'conflict',
                'skip',
                'skip',
                'merge-config',
            ]);
            expect(await Deno.readTextFile(config)).toBe(before);
            await expect(Deno.stat(join(options.projectRoot, 'different'))).rejects.toThrow();
            Fs.write = write;
            Deno.copyFile = copy;
            Deno.mkdir = mkdir;
            await Templates.apply({
                ...options,
                names: ['first', 'second'],
                overwrite: () => Promise.resolve(false),
            });
            expect(new TextDecoder().decode(virtual.get(config) as Uint8Array)).toBe(
                await Deno.readTextFile(config),
            );
            const parsed = await Conf.parse(
                new Blob([
                    new Uint8Array(virtual.get(config) as Uint8Array as Uint8Array),
                ]).stream(),
            );
            expect(parsed.toObject()).toEqual({
                defaultHarness: 'second',
                verify: { pre: [['one'], ['two']] },
            });
            expect(parsed.getComments().get('defaultHarness')).toEqual(['first', 'second']);
        } finally {
            Fs.write = write;
            Deno.copyFile = copy;
            Deno.mkdir = mkdir;
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('preview reports all structural conflicts and preserves validation errors', async () => {
    const { root, options, path } = await fixture();
    try {
        await Deno.mkdir(join(path, 'assets', 'a-directory'));
        await Deno.writeTextFile(join(path, 'assets', 'a-directory', 'child'), 'child');
        await Deno.writeTextFile(join(options.projectRoot, 'a-directory'), 'file');
        await Deno.writeTextFile(join(path, 'assets', 'b-file'), 'file');
        await Deno.mkdir(join(options.projectRoot, 'b-file'));
        await Deno.writeTextFile(join(path, 'assets', 'c-link'), 'file');
        await Deno.symlink(
            join(options.projectRoot, '.coderail', 'config'),
            join(options.projectRoot, 'c-link'),
        );
        const report = await Templates.apply({ ...options, mode: 'preview' });
        expect(report.conflicts).toEqual(
            ['a-directory', 'b-file', 'c-link'].map((name) => join(options.projectRoot, name)),
        );
        expect(report.actions.map((action) => action.kind)).toEqual([
            'conflict',
            'conflict',
            'conflict',
            'merge-config',
        ]);
        await Deno.writeTextFile(join(path, 'config'), 'no_color = "invalid"');
        await expect(Templates.apply({ ...options, mode: 'preview' })).rejects.toThrow(
            'Cannot apply template',
        );
        await expect(
            Templates.apply({ ...options, mode: 'preview', signal: AbortSignal.abort() }),
        ).rejects.toThrow();
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
