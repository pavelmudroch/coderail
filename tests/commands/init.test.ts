import { Conf } from '@conf';
import { expect } from '@std/expect';
import { join } from '@std/path';

import { UsageError } from '../../src/cli/usage-error.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { Init } from '../../src/commands/init.ts';

const defaultConfiguration = [
    '# Coderail configuration file, lines starting with "#" are comments.',
    '# Example:',
    '# default_harness = codex',
    '',
    '# Add your verification configuration here.',
    '# Example:',
    '# Optional global actions (place before rule entries):',
    '# [verify]',
    '# pre = [["mkdir", "-p", "coverage"]]',
    '# post = [["rm", "-rf", ".mutation-tmp"]]',
    '#',
    '# [[verify.rules]]',
    '# pattern = src/${path:**}/${file:*}.ts',
    '# commands = [',
    '#   ["command", "argument_1", "argument_2"]',
    '# ]',
    '',
].join('\n');

function context(
    root: string,
    args: string[] = [],
): RunContext<ReturnType<Init['parseArguments']>['args']> {
    return {
        context: { currentWorkingDirectory: root, installRoot: root },
        configuration: {
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: { rules: [] },
        },
        parsedArguments: new Init().parseArguments(args),
        signal: new AbortController().signal,
    };
}

Deno.test('Init creates a configuration scaffold and preserves it on repeated runs', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        const file = await Deno.open(path);
        expect((await Conf.parse(file.readable)).toObject()).toEqual({});
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        await Deno.writeTextFile(path, 'existing configuration');
        await Deno.writeTextFile(join(root, '.coderail', '.~config.lock'), 'other process');
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe('existing configuration');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init parses positional templates and literal arguments after --', () => {
    const command = new Init();
    expect(command.requiresInit).toBe(false);
    expect(command.getSubcommand()).toBeUndefined();
    expect(command.parseArguments([])).toEqual({
        args: { help: false, templates: [] },
        rest: [],
    });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: { help: false, templates: [] },
        rest: [],
    });
    expect(command.parseArguments(['first', 'second', '--', '-literal', '--help'])).toEqual({
        args: { help: false, templates: ['first', 'second', '-literal', '--help'] },
        rest: [],
    });
});

Deno.test('Init handles help and rejects invalid options', () => {
    const command = new Init();
    expect(command.shouldHandleHelp(command.parseArguments([]))).toBe(false);
    for (const help of ['-h', '--help']) {
        const parsed = command.parseArguments(['template', help, '--unknown']);
        expect(command.shouldHandleHelp(parsed)).toBe(true);
    }
    expect(command.getUsage()).toContain('cr init [--help] [<template> ...]');
    for (const option of ['--unknown', '-x', '--help=value']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
});

Deno.test('Init accepts templates on fresh and existing configurations', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    try {
        const command = new Init();
        await command.run(context(root, ['first', 'second']));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        await Deno.writeTextFile(path, 'preserved');
        await command.run(context(root, ['third', 'fourth']));
        expect(await Deno.readTextFile(path)).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init fills an existing directory without replacing its contents', async () => {
    const root = await Deno.makeTempDir();
    const directory = join(root, '.coderail');
    try {
        await Deno.mkdir(directory);
        await Deno.writeTextFile(join(directory, 'existing'), 'preserved');
        await new Init().run(context(root));
        expect(await Deno.readTextFile(join(directory, 'config'))).toBe(defaultConfiguration);
        expect(await Deno.readTextFile(join(directory, 'existing'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a lock conflict and keeps the existing directory', async () => {
    const root = await Deno.makeTempDir();
    const directory = join(root, '.coderail');
    const lock = join(directory, '.~config.lock');
    try {
        await Deno.mkdir(directory);
        await Deno.writeTextFile(lock, 'another process');
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(
            Deno.errors.AlreadyExists,
        );
        expect(await Deno.readTextFile(lock)).toBe('another process');
        await expect(Deno.stat(join(directory, 'config'))).rejects.toBeInstanceOf(
            Deno.errors.NotFound,
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a file blocking the configuration directory', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.writeTextFile(join(root, '.coderail'), 'preserved');
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(Error);
        expect(await Deno.readTextFile(join(root, '.coderail'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a directory blocking the configuration file', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    try {
        await Deno.mkdir(path, { recursive: true });
        await expect(new Init().run(context(root))).rejects.toThrow(
            `Expected "${path}" to be a file or a symlink.`,
        );
        expect((await Deno.stat(path)).isDirectory).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init preserves existing and dangling configuration symlinks', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'config');
    const target = join(root, 'existing.conf');
    try {
        await Deno.mkdir(join(root, '.coderail'));
        await Deno.writeTextFile(target, 'preserved');
        await Deno.symlink(target, path, { type: 'file' });
        await new Init().run(context(root));
        expect((await Deno.lstat(path)).isSymlink).toBe(true);
        expect(await Deno.readTextFile(target)).toBe('preserved');
        await Deno.remove(target);
        await new Init().run(context(root));
        expect(await Deno.readLink(path)).toBe(target);
        await expect(Deno.stat(target)).rejects.toBeInstanceOf(Deno.errors.NotFound);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

const requiredIgnoreLines = [
    '*',
    '!.gitignore',
    '!config',
    '!plans/',
    '!plans/**',
    '!tickets/',
    '!tickets/**',
];

Deno.test('Init repairs ignore rules once while preserving custom content', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', '.gitignore');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(requiredIgnoreLines.join('\n') + '\n');
        for (const custom of [
            '',
            '# custom\n*\n!plans/\ncustom',
            '*\n# custom\n!tickets/\n',
            '# custom\r\n*\r\n',
        ]) {
            await Deno.writeTextFile(path, custom);
            const expected = custom.startsWith('*\n') ? custom : '*\n' + custom;
            const missing = requiredIgnoreLines
                .slice(1)
                .filter((line) => !custom.split(/\r?\n/).includes(line));
            const repaired =
                expected + (expected.endsWith('\n') ? '' : '\n') + missing.join('\n') + '\n';
            await command.run(context(root));
            expect(await Deno.readTextFile(path)).toBe(repaired);
            await command.run(context(root));
            expect(await Deno.readTextFile(path)).toBe(repaired);
        }
        const complete = requiredIgnoreLines.join('\n') + '\n# custom\nplans/**';
        await Deno.writeTextFile(path, complete);
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(complete);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init ignores runtime output without untracking existing files', async () => {
    const root = await Deno.makeTempDir();
    async function git(...args: string[]): Promise<string> {
        const result = await new Deno.Command('git', {
            args: ['-C', root, ...args],
            stdout: 'piped',
            stderr: 'piped',
        }).output();
        expect(result.code).toBe(0);
        return new TextDecoder().decode(result.stdout);
    }
    try {
        await git('init', '-q');
        await Deno.mkdir(join(root, '.coderail'));
        await Deno.writeTextFile(join(root, '.coderail', 'tracked-runtime'), 'tracked');
        await git('add', '.');
        await Deno.writeTextFile(join(root, '.gitignore'), '# root rules\n');
        const exclude = await Deno.readTextFile(join(root, '.git', 'info', 'exclude'));
        await new Init().run(context(root));
        const visible = [
            '.gitignore',
            'config',
            'plans/IDEA.md',
            'plans/nested/content.md',
            'tickets/open/ticket.md',
            'tickets/nested/deep/content.md',
        ];
        for (const path of [...visible, 'output/run/log.txt', 'runtime.json']) {
            const target = join(root, '.coderail', path);
            await Deno.mkdir(join(target, '..'), { recursive: true });
            if (!['.gitignore', 'config'].includes(path)) {
                await Deno.writeTextFile(target, 'content');
            }
        }
        const eligible = (await git('ls-files', '--others', '--exclude-standard', '.coderail'))
            .trim()
            .split('\n');
        expect(eligible.sort()).toEqual(visible.map((path) => '.coderail/' + path).sort());
        expect(await git('ls-files', '.coderail/tracked-runtime')).toBe(
            '.coderail/tracked-runtime\n',
        );
        expect(await Deno.readTextFile(join(root, '.gitignore'))).toBe('# root rules\n');
        expect(await Deno.readTextFile(join(root, '.git', 'info', 'exclude'))).toBe(exclude);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init propagates ignore file read errors', async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.mkdir(join(root, '.coderail', '.gitignore'), { recursive: true });
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(
            Deno.errors.IsADirectory,
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
