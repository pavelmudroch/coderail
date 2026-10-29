import { expect } from '@std/expect';
import { compileRules } from '../../../src/commands/verify/compile-rules.ts';
import { type FileResult, runChecks } from '../../../src/commands/verify/run-checks.ts';

function command(code: string, ...args: string[]): string[] {
    return [Deno.execPath(), 'eval', code, ...args];
}

Deno.test('runChecks executes sequentially at the root and replays successes and failures', async () => {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        const first = command(
            "Deno.writeTextFileSync('order', 'first\\n', {append:true}); console.log('out'); console.error('err');",
        );
        const failure = command(
            "Deno.writeTextFileSync('order', 'fail\\n', {append:true}); Deno.exit(2);",
        );
        const later = command("Deno.writeTextFileSync('order', 'later\\n', {append:true});");
        const reports: FileResult[] = [];
        const counts = await runChecks(
            root,
            ['a', 'b', 'c'],
            compileRules([
                { pattern: '*', commands: [first] },
                { pattern: 'a', commands: [failure, later] },
                { pattern: 'b', commands: [failure] },
                { pattern: 'c', commands: [later] },
            ]),
            new AbortController().signal,
            (result) => reports.push(result),
        );
        expect(counts).toEqual({ executedCommands: 3, failedFiles: 2 });
        expect(await Deno.readTextFile(`${root}/order`)).toBe('first\nfail\nlater\n');
        expect(reports.map((result) => [result.path, result.status])).toEqual([
            ['a', 'fail'],
            ['b', 'fail'],
            ['c', 'ok'],
        ]);
        expect(reports[0]?.commands).toEqual(reports[1]?.commands);
        expect(reports[0]?.commands[0]?.output).toBe('out\nerr\n');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('runChecks checks literal dependencies when reached and skips unsafe paths', async () => {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        await Deno.mkdir(`${root}/directory`);
        await Deno.writeTextFile(`${root}/file`, '');
        await Deno.writeTextFile(`${root}/directory/child`, '');
        await Deno.symlink(`${root}/file`, `${root}/link`);
        await Deno.symlink(`${root}/directory`, `${root}/ancestor`);
        const create = command("Deno.writeTextFileSync('literal*', '');");
        const remove = command("Deno.removeSync('literal*');");
        const reports: FileResult[] = [];
        const rules = compileRules([
            ...['missing', 'directory', 'link', 'ancestor/child', 'file/child'].map(
                (required) => ({ pattern: '*', requires: [required], commands: [['unreachable']] }),
            ),
            { pattern: 'a', commands: [create] },
            { pattern: '*', requires: ['literal*'], commands: [remove] },
            { pattern: '*', commands: [[], []] },
            { pattern: '*', commands: [] },
        ]);
        expect(
            await runChecks(
                root,
                ['a', 'b'],
                rules,
                new AbortController().signal,
                (result) => reports.push(result),
            ),
        ).toEqual({ executedCommands: 2, failedFiles: 0 });
        expect(reports.map((result) => result.status)).toEqual(['ok', 'skipped']);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('runChecks preserves argument boundaries and complete output, including launch errors', async () => {
    const root = await Deno.realPath(await Deno.makeTempDir());
    try {
        const code =
            "console.log(JSON.stringify(Deno.args)); console.log('😀'.repeat(20000)); console.error('end');";
        const commands = [command(code, 'a b', 'c'), command(code, 'a', 'b c')];
        const reports: FileResult[] = [];
        const missing = [`${root}/missing`];
        expect(
            await runChecks(
                root,
                ['a', 'b'],
                compileRules([
                    { pattern: '*', commands: [...commands, missing] },
                ]),
                new AbortController().signal,
                (result) => reports.push(result),
            ),
        )
            .toEqual({ executedCommands: 3, failedFiles: 2 });
        expect(reports[0]?.commands).toEqual(reports[1]?.commands);
        expect(reports[0]?.commands[0]?.output).toBe(
            '["a b","c"]\n' + '😀'.repeat(20000) + '\nend\n',
        );
        expect(reports[0]?.commands[1]?.output).toBe(
            '["a","b c"]\n' + '😀'.repeat(20000) + '\nend\n',
        );
        expect(reports[0]?.commands[2]?.status).toBe('fail');
        expect(reports[0]?.commands[2]?.output).toContain('missing');
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('runChecks propagates dependency I/O errors', async () => {
    const original = Deno.lstat;
    const error = new Deno.errors.PermissionDenied('denied');
    Deno.lstat = () => Promise.reject(error);
    try {
        await expect(runChecks(
            '.',
            ['a'],
            compileRules([
                { pattern: '*', requires: ['file'], commands: [] },
            ]),
            new AbortController().signal,
            () => {},
        )).rejects.toBe(error);
    } finally {
        Deno.lstat = original;
    }
});

Deno.test('runChecks propagates cancellation before execution and during a command', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runChecks('.', [], [], controller.signal, () => {})).rejects.toBe(
        controller.signal.reason,
    );
    const root = await Deno.realPath(await Deno.makeTempDir());
    const running = new AbortController();
    const timer = setTimeout(() => running.abort(), 100);
    try {
        await expect(runChecks(
            root,
            ['a'],
            compileRules([
                {
                    pattern: '*',
                    commands: [
                        command('await new Promise(resolve => setTimeout(resolve, 10000));'),
                    ],
                },
            ]),
            running.signal,
            () => {
                throw new Error('unexpected report');
            },
        ))
            .rejects.toThrow('aborted');
        expect(running.signal.aborted).toBe(true);
    } finally {
        clearTimeout(timer);
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('runChecks skips filesystem roots, non-directory errors, and uncompiled empty commands', async () => {
    const reports: FileResult[] = [];
    expect(
        await runChecks(
            '.',
            ['a'],
            [
                { match: () => ({ requires: ['/'], commands: [['unreachable']] }) },
                { match: () => ({ requires: [], commands: [[]] }) },
            ],
            new AbortController().signal,
            (result) => reports.push(result),
        ),
    )
        .toEqual({ executedCommands: 0, failedFiles: 0 });
    expect(reports).toEqual([{ path: 'a', status: 'skipped', commands: [] }]);
    const original = Deno.lstat;
    Deno.lstat = () => Promise.reject(new Deno.errors.NotADirectory());
    try {
        expect(
            await runChecks(
                '.',
                ['a'],
                compileRules([
                    { pattern: '*', requires: ['file/child'], commands: [['unreachable']] },
                ]),
                new AbortController().signal,
                () => {},
            ),
        )
            .toEqual({ executedCommands: 0, failedFiles: 0 });
    } finally {
        Deno.lstat = original;
    }
});
