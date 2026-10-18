import { expect } from '@std/expect';
import { join } from '@std/path';
import { Init } from '../../src/commands/init.ts';
import type { RunContext } from '../../src/commands/helpers/command.ts';
import { UsageError } from '../../src/cli/usage-error.ts';

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

Deno.test('Init creates an empty configuration and preserves it on repeated runs', async () => {
    const root = await Deno.makeTempDir();
    const path = join(root, '.coderail', 'coderail.conf');
    try {
        const command = new Init();
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe('');
        await command.run(context(root));
        expect(await Deno.readTextFile(path)).toBe('');
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
    expect(command.parseArguments([])).toEqual({
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
        expect(await Deno.readTextFile(path)).toBe('');
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
        expect(await Deno.readTextFile(join(directory, 'coderail.conf'))).toBe('');
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
