import { expect } from '@std/expect';

import { compileRules } from '../../../src/commands/verify/compile-rules.ts';
import {
    executeCommand,
    type FileResult,
    runChecks,
} from '../../../src/commands/verify/run-checks.ts';

function command(code: string, ...args: string[]): string[] {
    return [Deno.execPath(), 'eval', code, ...args];
}

Deno.test(
    'runChecks executes sequentially at the root and replays successes and failures',
    async () => {
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
            expect(counts).toEqual({ uniqueCommands: 3, failedFiles: 2 });
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
    },
);

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
            ...['missing', 'directory', 'link', 'ancestor/child', 'file/child'].map((required) => ({
                pattern: '*',
                requires: [required],
                commands: [['unreachable']],
            })),
            { pattern: 'a', commands: [create] },
            { pattern: '*', requires: ['literal*'], commands: [remove] },
            { pattern: '*', commands: [[], []] },
            { pattern: '*', commands: [] },
        ]);
        expect(
            await runChecks(root, ['a', 'b'], rules, new AbortController().signal, (result) =>
                reports.push(result),
            ),
        ).toEqual({ uniqueCommands: 2, failedFiles: 0 });
        expect(reports.map((result) => result.status)).toEqual(['ok', 'skipped']);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test('runChecks streams complete lines from independent pipes once per command', async () => {
    const check = command(`
const encode = (text) => new TextEncoder().encode(text);
const out = encode('out 😀');
const err = encode('err é');
await Deno.stdout.write(out.subarray(0, -2));
await Deno.stderr.write(err.subarray(0, -1));
await new Promise(resolve => setTimeout(resolve, 30));
await Deno.stdout.write(out.subarray(-2));
await Deno.stderr.write(err.subarray(-1));
await Deno.stdout.write(encode('\\r'));
await new Promise(resolve => setTimeout(resolve, 30));
await Deno.stdout.write(encode('\\n\\nout two\\nout tail\\r'));
await Deno.stderr.write(encode('\\nerr two\\r\\nerr tail'));
Deno.exit(2);
`);
    const reports: FileResult[] = [];
    const headings: string[][] = [];
    const lines: string[] = [];
    expect(
        await runChecks(
            '.',
            ['a', 'b'],
            compileRules([{ pattern: '*', commands: [check] }]),
            new AbortController().signal,
            (result) => reports.push(result),
            false,
            {
                onStart: (argv) => headings.push(argv),
                onLine: (line) => {
                    expect(headings).toEqual([check]);
                    lines.push(line);
                },
            },
        ),
    ).toEqual({ uniqueCommands: 1, failedFiles: 2 });
    expect(headings).toEqual([check]);
    expect(lines.filter((line) => line.startsWith('out') || line === '')).toEqual([
        'out 😀',
        '',
        'out two',
        'out tail\r',
    ]);
    expect(lines.filter((line) => line.startsWith('err'))).toEqual([
        'err é',
        'err two',
        'err tail',
    ]);
    expect(lines).toHaveLength(7);
    expect(reports.map(({ path, status }) => [path, status])).toEqual([
        ['a', 'fail'],
        ['b', 'fail'],
    ]);
    expect(reports[0]?.commands).toEqual([{ command: check, status: 'fail', output: '' }]);
    expect(reports[0]?.commands[0]).toBe(reports[1]?.commands[0]);
});

Deno.test('executeCommand streams a successful command without storing its output', async () => {
    const check = command("console.log('ok');");
    const lines: string[] = [];
    expect(
        await executeCommand('.', check, new AbortController().signal, false, {
            onStart: () => {},
            onLine: (line) => lines.push(line),
        }),
    ).toEqual({ command: check, status: 'ok', output: '' });
    expect(lines).toEqual(['ok']);
});

Deno.test(
    'runChecks preserves argument boundaries and complete output, including launch errors',
    async () => {
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
                    compileRules([{ pattern: '*', commands: [...commands, missing] }]),
                    new AbortController().signal,
                    (result) => reports.push(result),
                ),
            ).toEqual({ uniqueCommands: 3, failedFiles: 2 });
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
    },
);

Deno.test('runChecks propagates dependency I/O errors', async () => {
    const original = Deno.lstat;
    const error = new Deno.errors.PermissionDenied('denied');
    Deno.lstat = () => Promise.reject(error);
    try {
        await expect(
            runChecks(
                '.',
                ['a'],
                compileRules([{ pattern: '*', requires: ['file'], commands: [] }]),
                new AbortController().signal,
                () => {},
            ),
        ).rejects.toBe(error);
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
        await expect(
            runChecks(
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
            ),
        ).rejects.toThrow('aborted');
        expect(running.signal.aborted).toBe(true);
    } finally {
        clearTimeout(timer);
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test(
    'runChecks skips filesystem roots, non-directory errors, and uncompiled empty commands',
    async () => {
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
        ).toEqual({ uniqueCommands: 0, failedFiles: 0 });
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
            ).toEqual({ uniqueCommands: 0, failedFiles: 0 });
        } finally {
            Deno.lstat = original;
        }
    },
);

Deno.test('executeCommand rejects an empty command', async () => {
    await expect(executeCommand('.', [], new AbortController().signal)).rejects.toThrow(
        'Cannot execute an empty command',
    );
});

Deno.test(
    'executeCommand settles a streaming child after cancellation or a listener error',
    async () => {
        const check = command(
            "console.log('started'); await new Promise(resolve => setTimeout(resolve, 5000));",
        );
        const cancelled = new AbortController();
        const error = new Error('stop streaming');
        const lines: string[] = [];
        await expect(
            executeCommand('.', check, cancelled.signal, false, {
                onStart: () => {},
                onLine: (line) => {
                    lines.push(line);
                    cancelled.abort(error);
                },
            }),
        ).rejects.toBe(error);
        expect(lines).toEqual(['started']);

        expect(
            await executeCommand('.', check, new AbortController().signal, false, {
                onStart: () => {},
                onLine: () => {
                    throw error;
                },
            }),
        ).toEqual({ command: check, status: 'fail', output: String(error) });
    },
);

Deno.test(
    'runChecks dry run expands rules, checks required files, and reuses planned commands',
    async () => {
        const root = await Deno.realPath(await Deno.makeTempDir());
        try {
            await Deno.writeTextFile(`${root}/a.required`, '');
            const reports: FileResult[] = [];
            const shared = command("Deno.writeTextFileSync('marker', '')");
            expect(
                await runChecks(
                    root,
                    ['a.ts', 'b.ts', 'other'],
                    compileRules([
                        {
                            pattern: '${file:*}.ts',
                            requires: ['${file}.required'],
                            commands: [['test', '${file}']],
                        },
                        { pattern: '*.ts', commands: [shared] },
                        { pattern: '*', requires: ['missing'], commands: [['unreachable']] },
                    ]),
                    new AbortController().signal,
                    (result) => reports.push(result),
                    true,
                    {
                        onStart: () => {
                            throw new Error('unexpected dry-run heading');
                        },
                        onLine: () => {
                            throw new Error('unexpected dry-run output');
                        },
                    },
                ),
            ).toEqual({ uniqueCommands: 2, failedFiles: 0 });
            expect(reports).toEqual([
                {
                    path: 'a.ts',
                    status: 'planned',
                    commands: [
                        { command: ['test', 'a'], status: 'planned', output: '' },
                        { command: shared, status: 'planned', output: '' },
                    ],
                },
                {
                    path: 'b.ts',
                    status: 'planned',
                    commands: [{ command: shared, status: 'planned', output: '' }],
                },
                { path: 'other', status: 'skipped', commands: [] },
            ]);
            expect(reports[0]?.commands[1]).toBe(reports[1]?.commands[0]);
            await expect(Deno.stat(`${root}/marker`)).rejects.toThrow();
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    },
);
