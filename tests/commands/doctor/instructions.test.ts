import { expect } from '@std/expect';
import { join } from '@std/path';

import { instructionName, Instructions } from '../../../src/commands/doctor/instructions.ts';

Deno.test('instruction repairs preserve customized metadata and body bytes', async () => {
    const root = await Deno.makeTempDir();
    const signal = new AbortController().signal;
    const path = join(root, 'SKILL.md');
    try {
        for (const eol of ['\n', '\r\n']) {
            for (const bom of ['', '\uFEFF']) {
                for (const name of [
                    '',
                    'name: wrong\n',
                    'name: ""\n',
                    '"na\\u006de": false\n',
                    '"name": [bad, names]\n',
                    "'name':\n  - wrong\n\n",
                ]) {
                    for (const opener of ['', '---\n']) {
                        const tail =
                            'description: "My custom description"\nextra: [one, true]\n---\n\n# Custom\n\nBody  \n---\n';
                        const original = bom + (opener + name + tail).replaceAll('\n', eol);
                        await Deno.writeTextFile(path, original);
                        const report = await Instructions.checkFile(path, 'expected', signal);
                        expect(await Deno.readFile(path)).toEqual(
                            new TextEncoder().encode(original),
                        );
                        expect(report.failures).toHaveLength(1);
                        const repair = report.failures[0]?.repair;
                        expect(repair).toBeDefined();
                        await repair?.apply(signal);
                        const changed = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
                            await Deno.readFile(path),
                        );
                        expect(changed.startsWith(bom + '---' + eol)).toBe(true);
                        expect(changed).toContain('name: "expected"' + eol);
                        expect(changed.endsWith(tail.replaceAll('\n', eol))).toBe(true);
                        expect(
                            (await Instructions.checkFile(path, 'expected', signal)).failures,
                        ).toEqual([]);
                    }
                }
            }
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('instruction manual findings never infer ambiguous frontmatter', async () => {
    const root = await Deno.makeTempDir();
    const signal = new AbortController().signal;
    const path = join(root, 'worker.md');
    try {
        for (const content of [
            '# Heading\ndescription: custom\n---\nbody',
            '\n---\nname: worker\ndescription: custom\n---\nbody',
            '---\nname: worker\ndescription: custom\nbody',
            'name: worker\ndescription: custom\nbody',
            '---\nname: worker\ndescription: ""\n---\nbody',
            '---\nname: worker\ndescription: "  "\n---\nbody',
            '---\nname: worker\ndescription: true\n---\nbody',
            '---\nname: worker\n---\nbody',
            '---\nname: worker\ndescription: [broken\n---\nbody',
            '---\nname: worker\nname: duplicate\ndescription: custom\n---\nbody',
        ]) {
            await Deno.writeTextFile(path, content);
            const report = await Instructions.checkFile(path, 'worker', signal);
            expect(report.failures).toHaveLength(1);
            expect(report.failures[0]?.repair).toBeUndefined();
            expect(report.failures[0]?.manualRepair.length).toBeGreaterThan(0);
            expect(await Deno.readTextFile(path)).toBe(content);
        }
        await Deno.writeTextFile(
            path,
            '---\nname: worker\ndescription: customized\n---\nfree body',
        );
        expect(await Instructions.checkFile(path, 'worker', signal)).toEqual({
            failures: [],
            skipped: [],
        });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('instruction closing delimiters require LF, CRLF or the actual end of file', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'worker.md');
    const signal = new AbortController().signal;
    try {
        for (const opener of ['', '---\n']) {
            for (const name of ['worker', 'wrong']) {
                for (const boundary of ['\r', '\u2028', '\u2029']) {
                    for (const body of ['', 'body\n---\n']) {
                        const content = `${opener}name: ${name}\ndescription: custom\n---${boundary}${body}`;
                        await Deno.writeTextFile(path, content);
                        const report = await Instructions.checkFile(path, 'worker', signal);
                        expect(report.failures).toHaveLength(1);
                        expect(report.failures[0]?.repairable).toBe(false);
                        expect(report.failures[0]?.repair).toBeUndefined();
                        expect(report.failures[0]?.manualRepair.length).toBeGreaterThan(0);
                        expect(await Deno.readFile(path)).toEqual(
                            new TextEncoder().encode(content),
                        );
                    }
                }
                for (const ending of ['', '\nbody', '\r\nbody']) {
                    const content = `${opener}name: ${name}\ndescription: custom\n---${ending}`;
                    await Deno.writeTextFile(path, content);
                    const report = await Instructions.checkFile(path, 'worker', signal);
                    if (!opener || name === 'wrong') {
                        expect(report.failures).toHaveLength(1);
                        expect(report.failures[0]?.repair).toBeDefined();
                        await report.failures[0]?.repair?.apply(signal);
                    } else {
                        expect(report.failures).toEqual([]);
                    }
                    expect((await Instructions.checkFile(path, 'worker', signal)).failures).toEqual(
                        [],
                    );
                    expect(await Deno.readTextFile(path)).toBe(
                        `---\nname: ${name === 'wrong' ? '"worker"' : name}\ndescription: custom\n---${ending}`,
                    );
                }
            }
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'instruction actions guard changed input, unsupported files and cancellation',
    async () => {
        const root = await Deno.makeTempDir();
        const path = join(root, 'worker.md');
        const signal = new AbortController().signal;
        const content = '---\nname: wrong\ndescription: custom\n---\nbody';
        try {
            await Deno.writeTextFile(path, content);
            const repair = (await Instructions.checkFile(path, 'worker', signal)).failures[0]
                ?.repair;
            await Deno.writeTextFile(path, content + ' changed');
            await expect(repair?.apply(signal)).rejects.toThrow('changed');
            const controller = new AbortController();
            controller.abort(new Error('cancelled'));
            await expect(repair?.apply(controller.signal)).rejects.toThrow('cancelled');
            await expect(Instructions.checkFile(path, 'worker', controller.signal)).rejects.toThrow(
                'cancelled',
            );
            await Deno.remove(path);
            await expect(repair?.apply(signal)).rejects.toThrow();
            expect(
                (await Instructions.checkFile(path, 'worker', signal)).failures[0]?.repairable,
            ).toBe(false);
            await Deno.mkdir(path);
            expect(
                (await Instructions.checkFile(path, 'worker', signal)).failures[0]?.message,
            ).toContain('regular file');
            await expect(repair?.apply(signal)).rejects.toThrow();
            await Deno.remove(path);
            const other = join(root, 'other');
            await Deno.writeTextFile(other, content);
            await Deno.symlink(other, path);
            expect(
                (await Instructions.checkFile(path, 'worker', signal)).failures[0]?.repairable,
            ).toBe(false);
            await expect(repair?.apply(signal)).rejects.toThrow();
            expect(await Deno.readTextFile(other)).toBe(content);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test('asset discovery selects only skills and Markdown subagents', async () => {
    const root = await Deno.makeTempDir();
    const signal = new AbortController().signal;
    try {
        expect(await Instructions.checkAssets(root, signal)).toEqual({ failures: [], skipped: [] });
        for (const directory of ['instructions/skills/custom', 'instructions/agents']) {
            await Deno.mkdir(join(root, directory), { recursive: true });
        }
        const skill = join(root, 'instructions/skills/custom/SKILL.md');
        const agent = join(root, 'instructions/agents/worker.md');
        for (const path of [skill, agent]) {
            await Deno.writeTextFile(path, '---\ndescription: customized\n---\ncustom body');
        }
        await Deno.writeTextFile(join(root, 'instructions/agents/codex.toml'), 'not Markdown');
        await Deno.writeTextFile(
            join(root, 'instructions/skills/custom/reference.md'),
            'reference',
        );
        const report = await Instructions.checkAssets(root, signal);
        expect(report.failures).toHaveLength(2);
        for (const finding of report.failures) {
            await finding.repair?.apply(signal);
        }
        expect((await Instructions.checkAssets(root, signal)).failures).toEqual([]);
        expect(await Deno.readTextFile(skill)).toContain('name: "custom"');
        expect(await Deno.readTextFile(agent)).toContain('name: "worker"');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('instruction selection excludes references and other installed formats', () => {
    for (const prefix of ['', '.codex/', 'instructions/']) {
        expect(instructionName(`${prefix}skills/unique-name/SKILL.md`)).toBe('unique-name');
        expect(instructionName(`${prefix}agents/another-name.md`)).toBe('another-name');
    }
    for (const path of [
        'personal.md',
        'agents/worker.toml',
        'skills/custom/reference.md',
        'skills/custom/references/agents/example.md',
        'skills/custom/nested/skills/other/SKILL.md',
    ]) {
        expect(instructionName(path)).toBeUndefined();
    }
});

Deno.test('missing opener preserves a valid name and uses metadata line endings', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, 'worker.md');
    const signal = new AbortController().signal;
    try {
        for (const name of ['worker', 'wrong']) {
            const original = `name: ${name}\ndescription: custom\n---\nBody\r\n`;
            await Deno.writeTextFile(path, original);
            await (
                await Instructions.checkFile(path, 'worker', signal)
            ).failures[0]?.repair?.apply(signal);
            expect(await Deno.readTextFile(path)).toBe(
                `---\nname: ${name === 'worker' ? 'worker' : '"worker"'}\ndescription: custom\n---\nBody\r\n`,
            );
        }
        await Deno.writeTextFile(path, '---\nname: wrong\r\ndescription: custom\n---\nBody\r\n');
        await (
            await Instructions.checkFile(path, 'worker', signal)
        ).failures[0]?.repair?.apply(signal);
        expect(await Deno.readTextFile(path)).toBe(
            '---\nname: "worker"\r\ndescription: custom\n---\nBody\r\n',
        );
        await Deno.writeTextFile(path, '---\nname: worker\ndescription: custom\n---');
        expect((await Instructions.checkFile(path, 'worker', signal)).failures).toEqual([]);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'instruction discovery reports access errors and propagates cancellation during IO',
    async () => {
        const root = await Deno.makeTempDir();
        const original = { readDir: Deno.readDir, lstat: Deno.lstat, readFile: Deno.readFile };
        const path = join(root, 'worker.md');
        const signal = new AbortController().signal;
        try {
            Deno.readDir = () => {
                throw new Deno.errors.PermissionDenied('assets denied');
            };
            const report = await Instructions.checkAssets(root, signal);
            expect(report.failures).toHaveLength(2);
            expect(report.failures[0]?.message).toContain('assets denied');
            expect(report.failures[0]?.repairable).toBe(false);
            expect(report.failures[0]?.manualRepair.length).toBeGreaterThan(0);
            const controller = new AbortController();
            Deno.readDir = () => {
                controller.abort(new Error('cancel discovery'));
                throw controller.signal.reason;
            };
            await expect(Instructions.checkAssets(root, controller.signal)).rejects.toThrow(
                'cancel discovery',
            );
            Deno.readDir = original.readDir;
            await Deno.writeTextFile(path, '---\nname: wrong\ndescription: custom\n---\nbody');
            const readController = new AbortController();
            Deno.readFile = () => {
                readController.abort(new Error('cancel read'));
                throw readController.signal.reason;
            };
            await expect(
                Instructions.checkFile(path, 'worker', readController.signal),
            ).rejects.toThrow('cancel read');
            Deno.readFile = original.readFile;
            const statController = new AbortController();
            Deno.lstat = () => {
                statController.abort(new Error('cancel stat'));
                return original.lstat(path);
            };
            await expect(
                Instructions.checkFile(path, 'worker', statController.signal),
            ).rejects.toThrow('cancel stat');
            Deno.lstat = original.lstat;
            await Deno.mkdir(join(root, 'directory'));
            await Deno.symlink(join(root, 'directory'), join(root, 'link'));
            await Deno.writeTextFile(
                join(root, 'directory/worker.md'),
                '---\nname: wrong\ndescription: custom\n---\nbody',
            );
            expect(
                (await Instructions.checkFile(join(root, 'link/worker.md'), 'worker', signal))
                    .failures[0]?.repairable,
            ).toBe(false);
        } finally {
            Deno.readDir = original.readDir;
            Deno.lstat = original.lstat;
            Deno.readFile = original.readFile;
            await Deno.remove(root, { recursive: true });
        }
    },
);
