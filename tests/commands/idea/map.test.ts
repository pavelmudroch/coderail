import { expect } from '@std/expect';
import { join } from '@std/path';
import { Log } from '@log';
import { UsageError } from '../../../src/cli/usage-error.ts';
import { Map } from '../../../src/commands/idea/map.ts';
import { testIdeaSubcommand } from './helpers.ts';

testIdeaSubcommand('map', Map);

Deno.test('Idea map accepts only the JSON flag and no positional arguments', () => {
    const command = new Map();
    expect(command.parseArguments([])).toEqual({ args: { help: false, json: false }, rest: [] });
    expect(command.parseArguments(new Array<string>(1))).toEqual({
        args: { help: false, json: false },
        rest: [],
    });
    expect(command.parseArguments(['--json'])).toEqual({
        args: { help: false, json: true },
        rest: [],
    });
    for (const args of [['idea'], ['--', '--json'], ['--json=true'], ['--parent', 'idea']]) {
        expect(() => command.parseArguments(args)).toThrow(UsageError);
    }
});

Deno.test('Idea map renders nested ideas as text and JSON with metadata and parents', async () => {
    const root = await Deno.makeTempDir();
    const plans = join(root, '.coderail', 'plans');
    const output: unknown[][] = [];
    const originalOutput = Log.output;
    const originalNoColor = Log.noColor;
    Log.output = (...messages: unknown[]): void => {
        output.push(messages);
    };
    Log.noColor = true;
    try {
        const ideas = [
            { path: 'a-root', title: 'Parent title', status: 'split', parent: null },
            { path: 'a-root/child', title: 'Child title', status: 'ready', parent: 'a-root' },
            { path: 'z-root', title: 'Last title', status: 'forging', parent: null },
            { path: 'z-root/leaf', title: 'Leaf title', status: 'forging', parent: 'z-root' },
        ];
        for (const idea of ideas) {
            const directory = join(plans, idea.path);
            await Deno.mkdir(directory, { recursive: true });
            await Deno.writeTextFile(
                join(directory, 'IDEA.md'),
                `---\ntitle: ${idea.title}\nstatus: ${idea.status}\n---\n`,
            );
        }
        const command = new Map();
        for (const args of [[], ['--json']]) {
            await command.run({
                context: { currentWorkingDirectory: root, installRoot: '/install' },
                configuration: {
                    logLevel: 'normal',
                    noColor: true,
                    nonInteractive: false,
                    verify: [],
                },
                parsedArguments: command.parseArguments(args),
                signal: new AbortController().signal,
            });
        }
        expect(output[0]).toEqual([[
            '├── Parent title split [IDEA.md]',
            '│   └── Child title ready [IDEA.md]',
            '└── Last title forging [IDEA.md]',
            '    └── Leaf title forging [IDEA.md]',
        ].join('\n')]);
        expect(JSON.parse(String(output[1]?.[0]))).toEqual(ideas.map((idea) => ({
            ...idea,
            dir: join(plans, idea.path),
            files: ['IDEA.md'],
        })));
    } finally {
        Log.output = originalOutput;
        Log.noColor = originalNoColor;
        await Deno.remove(root, { recursive: true });
    }
});
