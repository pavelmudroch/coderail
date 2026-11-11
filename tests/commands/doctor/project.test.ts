import { expect } from '@std/expect';
import { dirname, join, parse } from '@std/path';

import { Project } from '../../../src/commands/doctor/project.ts';
import { projectIgnoreLines } from '../../../src/runtime/context.ts';

Deno.test(
    'project discovers the nearest marker and diagnoses incomplete initialization without mutations',
    async () => {
        const root = await Deno.makeTempDir();
        const signal = new AbortController().signal;
        try {
            const marker = join(root, '.coderail');
            await Deno.mkdir(marker);
            const child = join(root, 'child');
            await Deno.mkdir(child);
            expect((await Project.discover(root, signal)).repositoryRoot).toBe(root);
            expect((await Project.discover(child, signal)).repositoryRoot).toBe(root);
            expect((await Project.check(root, signal)).failures).toHaveLength(2);
            expect(Array.from(Deno.readDirSync(marker))).toEqual([]);
            await Deno.writeTextFile(join(marker, 'config'), 'invalid = true');
            await Deno.writeTextFile(join(marker, '.gitignore'), projectIgnoreLines.join('\n'));
            expect((await Project.check(root, signal)).failures).toEqual([]);
            await Deno.writeTextFile(
                join(marker, '.gitignore'),
                [...projectIgnoreLines].reverse().join('\n'),
            );
            expect((await Project.check(root, signal)).failures).toHaveLength(1);
            await Deno.mkdir(join(child, '.coderail'));
            expect((await Project.discover(child, signal)).repositoryRoot).toBe(child);
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);

Deno.test(
    'project handles filesystem root, discovery failures, read failures and cancellation',
    async () => {
        const stat = Deno.stat;
        const read = Deno.readTextFile;
        const signal = new AbortController().signal;
        const root = parse(Deno.cwd()).root;
        try {
            Deno.stat = (path) =>
                path === root ? stat(root) : Promise.reject(new Deno.errors.NotFound());
            expect(await Project.discover(root, signal)).toMatchObject({
                failures: [],
            });
            Deno.stat = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));
            const failed = await Project.discover(dirname(Deno.cwd()), signal);
            expect(failed.failures).toHaveLength(1);
            expect(failed.skipped.length).toBeGreaterThan(0);
            expect(failed.repositoryRoot).toBeUndefined();
            Deno.readTextFile = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));
            expect((await Project.check(root, signal)).failures).toHaveLength(1);
            const controller = new AbortController();
            Deno.stat = () => {
                controller.abort(new Error('cancelled'));
                return Promise.reject(new Deno.errors.PermissionDenied());
            };
            await expect(Project.discover(root, controller.signal)).rejects.toThrow('cancelled');
            await expect(Project.check(root, controller.signal)).rejects.toThrow('cancelled');
        } finally {
            Deno.stat = stat;
            Deno.readTextFile = read;
        }
    },
);

Deno.test('project reports invalid cwd and unreadable ancestor markers', async () => {
    const stat = Deno.stat;
    const root = parse(Deno.cwd()).root;
    const signal = new AbortController().signal;
    try {
        const directory = await stat(root);
        Deno.stat = () => Promise.resolve({ ...directory, isDirectory: false });
        expect((await Project.discover(root, signal)).failures[0]?.message).toContain(
            'not a directory',
        );
        Deno.stat = (path) =>
            path === root
                ? Promise.resolve(directory)
                : Promise.reject(new Deno.errors.PermissionDenied('marker'));
        expect((await Project.discover(root, signal)).failures[0]?.message).toContain('marker');
        Deno.stat = () => Promise.resolve({ ...directory, isDirectory: false });
        let first = true;
        Deno.stat = () => {
            const isDirectory = first;
            first = false;
            return Promise.resolve({ ...directory, isDirectory });
        };
        expect((await Project.discover(root, signal)).failures).toEqual([]);
    } finally {
        Deno.stat = stat;
    }
});
