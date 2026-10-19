import { expect } from '@std/expect';
import { join } from '@std/path';
import { Init } from '../../src/commands/init.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { UsageError } from '../../src/cli/usage-error.ts';
import { Conf } from '@conf';

const defaultConfiguration = [
    '# Coderail configuration file, lines starting with "#" are comments.',
    '# Example:',
    '# default_harness = codex',
    '',
    '# Add your verification configuration here.',
    '# Example:',
    '# [[verify]]',
    '# pattern = src/${path:**}/${file:*}.ts',
    '# commands = [',
    '#   ["command", "argument_1", "argument_2"]',
    '# ]',
    '',
].join('\n');

function context(root: string, args: string[] = []): RunContext<
    ReturnType<Init['parseArguments']>['args']
> {
    return {
        context: { currentWorkingDirectory: root, installRoot: root },
        configuration: { logLevel: 'normal', noColor: false, nonInteractive: false, verify: [] },
        parsedArguments: new Init().parseArguments(args),
        signal: new AbortController().signal,
    };
}

Deno.test('Init creates a configuration scaffold and preserves it on repeated runs', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'coderail.conf');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        const file = await Deno.open(path);
        expect((await Conf.parse(file.readable)).toObject()).toEqual({});
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe(defaultConfiguration);
        await Deno.writeTextFile(path, 'existing configuration');
        await Deno.writeTextFile(join(root, '.coderail', '.~coderail.conf.lock'), 'other process');
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
    expect(command.getUsage()).toContain('cr init [options] [<template> ...]');
    for (const option of ['--unknown', '-x', '--help=value']) {
        expect(() => command.parseArguments([option])).toThrow(UsageError);
    }
});

Deno.test('Init accepts templates on fresh and existing configurations', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'coderail.conf');
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
        expect(await Deno.readTextFile(join(directory, 'coderail.conf'))).toBe(
            defaultConfiguration,
        );
        expect(await Deno.readTextFile(join(directory, 'existing'))).toBe('preserved');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init rejects a lock conflict and keeps the existing directory', async () => {
    const root = await Deno.makeTempDir();
    const directory = join(root, '.coderail');
    const lock = join(directory, '.~coderail.conf.lock');
    try {
        await Deno.mkdir(directory);
        await Deno.writeTextFile(lock, 'another process');
        await expect(new Init().run(context(root))).rejects.toBeInstanceOf(
            Deno.errors.AlreadyExists,
        );
        expect(await Deno.readTextFile(lock)).toBe('another process');
        await expect(Deno.stat(join(directory, 'coderail.conf'))).rejects.toBeInstanceOf(
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
    const path = join(root, '.coderail', 'coderail.conf');
    try {
        await Deno.mkdir(path, { recursive: true });
        await expect(new Init().run(context(root)))
            .rejects.toThrow(`Expected "${path}" to be a file or a symlink.`);
        expect((await Deno.stat(path)).isDirectory).toBe(true);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('Init preserves existing and dangling configuration symlinks', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'coderail.conf');
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
