import { expect } from '@std/expect';
import { Cli } from '@cli';
import { type Command, Commands, type GlobalArguments } from '@commands';
import { Conf } from '@conf';
import { Log } from '@log';
import { Runtime } from '@runtime';

let runId = 0;

async function run(args: readonly string[]): Promise<void> {
    const originalArgs = [...Deno.args];
    Deno.args.splice(0, Deno.args.length, ...args);
    Deno.exitCode = 0;
    try {
        // A unique URL reruns the entry point for each invocation.
        await import(new URL(`../src/main.ts?test=${++runId}`, import.meta.url).href);
    } finally {
        Deno.args.splice(0, Deno.args.length, ...originalArgs);
    }
}

type Fixture = Disposable & {
    events: string[];
    output: unknown[][];
    globals: GlobalArguments[];
    executions: Parameters<Command['run']>[0][];
    controller: AbortController;
    errors: unknown[][];
    warnings: unknown[][];
    usage: unknown[][];
};

function setupCommands(): Fixture {
    const events: string[] = [];
    const output: unknown[][] = [];
    const globals: GlobalArguments[] = [];
    const executions: Parameters<Command['run']>[0][] = [];
    const controller = new AbortController();
    const errors: unknown[][] = [];
    const warnings: unknown[][] = [];
    const usage: unknown[][] = [];
    const rootCommand = Commands.cr();
    const original = {
        cr: Commands.cr,
        registerSignalHandlers: Runtime.registerSignalHandlers,
        cleanup: Runtime.cleanup,
        createContext: Runtime.createContext,
        loadConfiguration: Conf.loadConfiguration,
        level: Log.level,
        output: Log.output,
        error: Log.error,
        warn: Log.warn,
        info: Log.info,
        trace: Log.trace,
        exitCode: Deno.exitCode,
    };
    const create: Command = {
        requiresInit: true,
        parseArguments(args): ReturnType<Command['parseArguments']> {
            events.push('parse:create');
            return { args: { help: args[0] === '--help' }, rest: [...args] };
        },
        shouldHandleHelp: (parsedArguments) => parsedArguments.args.help === true,
        getUsage: () => 'Create usage',
        getSubcommand: () => undefined,
        run(context): Promise<void> {
            events.push('run:create');
            expect(Log.level).toBe(context.configuration.logLevel);
            executions.push(context);
            return Promise.resolve();
        },
    };
    const ticket: Command = {
        requiresInit: false,
        parseArguments(args): ReturnType<Command['parseArguments']> {
            events.push('parse:ticket');
            return {
                args: { command: args[0], help: args[0] === '--help' },
                rest: args.slice(1),
            };
        },
        shouldHandleHelp: (parsedArguments) => parsedArguments.args.help === true,
        getUsage: () => 'Ticket usage',
        getSubcommand(parsedArguments): Command {
            if (parsedArguments.args.command === 'create') {
                return create;
            }
            Cli.raiseUsageError('Expected create subcommand.', ticket);
        },
        run(): Promise<void> {
            throw new Error('Grouping commands must not execute');
        },
    };

    rootCommand.getSubcommand = (parsedArguments) => {
        if (parsedArguments.args.command === 'ticket') {
            return ticket;
        }
        Cli.raiseUsageError('Expected ticket command.', rootCommand);
    };
    Commands.cr = () => rootCommand;
    Runtime.registerSignalHandlers = () => ({
        signal: controller.signal,
        [Symbol.dispose](): void {},
    });
    Runtime.cleanup = () => {
        events.push('cleanup');
        return Promise.resolve();
    };
    Runtime.createContext = (global, command) => {
        events.push('context');
        expect(Log.level).toBe(global.verbose ? 'verbose' : global.quiet ? 'quiet' : 'normal');
        globals.push(global);
        expect(command).toBe(create);
        return Promise.resolve({
            currentWorkingDirectory: '/project',
            installRoot: '/install',
            repositoryRoot: '/project',
        });
    };
    Conf.loadConfiguration = (_context, global) => {
        events.push('configuration');
        expect(global).toBe(globals[0]);
        return Promise.resolve({
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: [],
        });
    };
    Log.output = (...messages) => {
        output.push(messages);
    };
    Log.error = (...messages) => {
        errors.push(messages);
    };
    Log.warn = (...messages) => {
        warnings.push(messages);
    };
    Log.info = (...messages) => {
        usage.push(messages);
    };
    Log.trace = () => {};

    return {
        events,
        output,
        globals,
        executions,
        controller,
        errors,
        warnings,
        usage,
        [Symbol.dispose](): void {
            Commands.cr = original.cr;
            Runtime.registerSignalHandlers = original.registerSignalHandlers;
            Runtime.cleanup = original.cleanup;
            Runtime.createContext = original.createContext;
            Conf.loadConfiguration = original.loadConfiguration;
            Log.level = original.level;
            Log.output = original.output;
            Log.error = original.error;
            Log.warn = original.warn;
            Log.info = original.info;
            Log.trace = original.trace;
            Deno.exitCode = original.exitCode;
        },
    };
}

Deno.test('main shows help at each level without runtime setup', async () => {
    using fixture = setupCommands();
    for (
        const [args, usage, events] of [
            [['--help'], Commands.cr().getUsage(), []],
            [['ticket', '--help'], 'Ticket usage', ['parse:ticket']],
            [
                ['ticket', 'create', '--help'],
                'Create usage',
                ['parse:ticket', 'parse:create'],
            ],
        ] as const
    ) {
        fixture.events.length = 0;
        fixture.output.length = 0;
        await run(args);
        expect(fixture.output).toEqual([[usage]]);
        expect(fixture.events).toEqual([...events, 'cleanup']);
        expect(fixture.executions).toEqual([]);
        expect(fixture.errors).toEqual([]);
        expect(Deno.exitCode).toBe(0);
    }
});

Deno.test('main preserves early version handling and help precedence', async () => {
    using fixture = setupCommands();
    await run(['ticket', 'create', '--version']);
    expect(fixture.output).toEqual([[`Coderail version ${Cli.version}`]]);
    expect(fixture.events).toEqual(['cleanup']);

    fixture.output.length = 0;
    fixture.events.length = 0;
    await run(['--version', '--help']);
    expect(fixture.output).toEqual([[Commands.cr().getUsage()]]);
    expect(fixture.events).toEqual(['cleanup']);
    expect(fixture.errors).toEqual([]);
    expect(Deno.exitCode).toBe(0);
});

Deno.test('main executes only the leaf and preserves globals and literal arguments', async () => {
    using fixture = setupCommands();
    await run(['--cwd', 'project', 'ticket', 'create', '-v', '--', '--help']);

    expect(fixture.events).toEqual([
        'parse:ticket',
        'parse:create',
        'context',
        'configuration',
        'run:create',
        'cleanup',
    ]);
    expect(fixture.output).toEqual([]);
    expect(fixture.globals[0]).toMatchObject({ cwd: 'project', verbose: true });
    expect(fixture.executions).toHaveLength(1);
    expect(fixture.executions[0]?.parsedArguments).toEqual({
        args: { help: false },
        rest: ['--', '--help'],
    });
    expect(fixture.executions[0]?.signal).toBe(fixture.controller.signal);
    expect(fixture.executions[0]?.context.repositoryRoot).toBe('/project');
    expect(fixture.executions[0]?.configuration.logLevel).toBe('normal');
    expect(Log.level).toBe('normal');
    expect(fixture.errors).toEqual([]);
    expect(Deno.exitCode).toBe(0);
});

Deno.test('main reports missing and unknown children before runtime setup', async () => {
    using fixture = setupCommands();
    for (const args of [[], ['unknown'], ['ticket'], ['ticket', 'unknown']]) {
        fixture.errors.length = 0;
        fixture.usage.length = 0;
        fixture.events.length = 0;
        await run(args);
        expect(fixture.errors).toHaveLength(1);
        expect(Cli.isUsageError(fixture.errors[0]?.[0])).toBe(true);
        expect(fixture.usage).toEqual([
            [args[0] === 'ticket' ? 'Ticket usage' : Commands.cr().getUsage()],
        ]);
        expect(Deno.exitCode).toBe(2);
        expect(fixture.events.at(-1)).toBe('cleanup');
    }
    expect(fixture.globals).toEqual([]);
    expect(fixture.executions).toEqual([]);
});

Deno.test('main does not execute when aborted', async () => {
    using fixture = setupCommands();
    const reason = new Error('Cancelled');
    fixture.controller.abort(reason);
    await run(['ticket', 'create']);
    expect(fixture.executions).toEqual([]);
    expect(fixture.warnings).toEqual([['Operation was aborted']]);
    expect(fixture.errors).toEqual([]);
    expect(Deno.exitCode).toBe(3);
    expect(fixture.events.at(-1)).toBe('cleanup');
});
