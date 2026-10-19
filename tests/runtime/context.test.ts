import { expect } from '@std/expect';
import { dirname, join, relative, resolve, toFileUrl } from '@std/path';
import { createContext } from '../../src/runtime/context.ts';
import type { GlobalArguments } from '@commands';

function globals(cwd?: string): GlobalArguments {
    return {
        cwd,
        help: false,
        version: false,
        nonInteractive: false,
        noColor: false,
        verbose: false,
        quiet: false,
    };
}

async function fixture(): Promise<
    AsyncDisposable & {
        root: string;
        project: string;
        entry: string;
        launch(path: string, standalone?: boolean): void;
    }
> {
    const root = await Deno.makeTempDir();
    const project = join(root, 'project');
    const entry = join(root, 'install', 'src', 'main.ts');
    const mainModule = Object.getOwnPropertyDescriptor(Deno, 'mainModule');
    const build = Deno.build;
    const execPath = Deno.execPath;
    await Deno.mkdir(project);
    await Deno.mkdir(dirname(entry), { recursive: true });
    await Deno.writeTextFile(entry, '');

    function launch(path: string, compiled = false): void {
        Object.defineProperty(Deno, 'mainModule', {
            configurable: true,
            value: toFileUrl(path).href,
        });
        Object.defineProperty(Deno, 'build', {
            configurable: true,
            value: { ...build, standalone: compiled },
        });
        Deno.execPath = () => path;
    }

    launch(entry);
    return {
        root,
        project,
        entry,
        launch,
        async [Symbol.asyncDispose](): Promise<void> {
            if (mainModule !== undefined) Object.defineProperty(Deno, 'mainModule', mainModule);
            Object.defineProperty(Deno, 'build', { configurable: true, value: build });
            Deno.execPath = execPath;
            await Deno.remove(root, { recursive: true });
        },
    };
}

Deno.test('Runtime::createContext resolves cwd without changing the process directory', async () => {
    await using f = await fixture();
    const cwd = Deno.cwd();
    for (const path of [undefined, '', '.', f.project, relative(cwd, f.project)]) {
        const context = await createContext(globals(path), { requiresInit: false });
        expect(context.currentWorkingDirectory).toBe(resolve(cwd, path ?? '.'));
        expect(context.installRoot).toBe(await Deno.realPath(join(f.root, 'install')));
        expect(Deno.cwd()).toBe(cwd);
    }
});

Deno.test('Runtime::createContext rejects missing working directories and files', async () => {
    await using f = await fixture();
    await expect(createContext(globals(join(f.root, 'missing')), { requiresInit: false }))
        .rejects.toBeInstanceOf(Deno.errors.NotFound);
    await expect(createContext(globals(f.entry), { requiresInit: false }))
        .rejects.toThrow('is not a directory');
});

Deno.test('Runtime::createContext finds initialization in cwd and ancestors without Git', async () => {
    await using f = await fixture();
    await Deno.mkdir(join(f.project, '.coderail'));
    const child = join(f.project, 'nested', 'child');
    await Deno.mkdir(child, { recursive: true });
    for (const cwd of [f.project, child]) {
        for (const requiresInit of [false, true]) {
            const context = await createContext(globals(cwd), { requiresInit });
            expect(context.repositoryRoot).toBe(f.project);
            expect(context.currentWorkingDirectory).toBe(cwd);
        }
    }
});

Deno.test('Runtime::createContext selects the nearest initialized project', async () => {
    await using f = await fixture();
    const nested = join(f.project, 'nested');
    await Deno.mkdir(join(f.project, '.coderail'));
    await Deno.mkdir(join(nested, '.coderail'), { recursive: true });
    expect((await createContext(globals(nested), { requiresInit: true })).repositoryRoot)
        .toBe(nested);
});

Deno.test('Runtime::createContext permits missing initialization only for optional commands', async () => {
    await using f = await fixture();
    expect((await createContext(globals(f.project), { requiresInit: false })).repositoryRoot)
        .toBeUndefined();
    await expect(createContext(globals(f.project), { requiresInit: true }))
        .rejects.toThrow('Run "cr init"');
});

Deno.test('Runtime::createContext ignores a file named .coderail and continues upward', async () => {
    await using f = await fixture();
    await Deno.mkdir(join(f.root, '.coderail'));
    await Deno.writeTextFile(join(f.project, '.coderail'), 'not a directory');
    expect((await createContext(globals(f.project), { requiresInit: true })).repositoryRoot)
        .toBe(f.root);
});

Deno.test('Runtime::createContext follows links to initialization directories', async () => {
    await using f = await fixture();
    const configuration = join(f.root, 'configuration');
    await Deno.mkdir(configuration);
    await Deno.symlink(configuration, join(f.project, '.coderail'), { type: 'dir' });
    expect((await createContext(globals(f.project), { requiresInit: true })).repositoryRoot)
        .toBe(f.project);
});

Deno.test('Runtime::createContext resolves script and compiled installation symlink chains', async () => {
    await using f = await fixture();
    const executable = join(f.root, 'compiled', 'bin', 'cr');
    await Deno.mkdir(dirname(executable), { recursive: true });
    await Deno.writeTextFile(executable, '');
    for (
        const [entry, compiled, expectedRoot] of [
            [f.entry, false, join(f.root, 'install')],
            [executable, true, join(f.root, 'compiled')],
        ] as const
    ) {
        const link = join(f.root, `entry-${compiled}`);
        const outerLink = join(f.root, `outer-${compiled}`);
        await Deno.symlink(relative(f.root, entry), link, { type: 'file' });
        await Deno.symlink(relative(f.root, link), outerLink, { type: 'file' });
        for (const path of [entry, outerLink]) {
            f.launch(path, compiled);
            // The unused launch source must not affect installation discovery.
            if (compiled) {
                Object.defineProperty(Deno, 'mainModule', { value: 'file:///missing/main.ts' });
            } else {
                Deno.execPath = () => join(f.root, 'missing-deno');
            }
            const context = await createContext(globals(f.project), { requiresInit: false });
            expect(context.installRoot).toBe(await Deno.realPath(expectedRoot));
        }
    }
});

Deno.test('Runtime::createContext propagates discovery errors for optional commands', async () => {
    await using f = await fixture();
    const stat = Deno.stat;
    const failure = new Deno.errors.PermissionDenied('configuration directory is inaccessible');
    Deno.stat = (path): ReturnType<typeof Deno.stat> => {
        if (path === join(f.project, '.coderail')) return Promise.reject(failure);
        return stat(path);
    };
    try {
        await expect(createContext(globals(f.project), { requiresInit: false }))
            .rejects.toBe(failure);
    } finally {
        Deno.stat = stat;
    }
});
