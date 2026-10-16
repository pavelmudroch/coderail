import { expect } from '@std/expect';
import type { GlobalArguments } from '@cli';
import { Conf } from '@conf';
import { Log } from '@log';
import { Runtime } from '@runtime';
import type { Command } from '../../src/commands/get-command.ts';
import { rootCommand } from '../../src/commands/root-command.ts';
import { run } from '../../src/commands/run.ts';
import { UsageError } from '../../src/cli/usage-error.ts';
import { CODERAIL_VERSION } from '../../src/version.ts';

type Fixture = Disposable & {
    events: string[];
    output: unknown[][];
    globals: GlobalArguments[];
    executions: Parameters<Command['run']>[0][];
    controller: AbortController;
};

function setupCommands(): Fixture {
    const events: string[] = [];
    const output: unknown[][] = [];
    const globals: GlobalArguments[] = [];
    const executions: Parameters<Command['run']>[0][] = [];
    const controller = new AbortController();
    const original = {
        getSubcommand: rootCommand.getSubcommand,
        createContext: Runtime.createContext,
        loadConfiguration: Conf.loadConfiguration,
        configureLogging: Log.configureLogging,
        output: Log.output,
    };
    const create: Command = {
        requiresRepository: true,
        parseArguments(args): ReturnType<Command['parseArguments']> {
            events.push('parse:create');
            return { arguments: { help: args[0] === '--help' }, rest: [...args] };
        },
        shouldHandleHelp: (parsedArguments) => parsedArguments.arguments.help === true,
        getUsage: () => 'Create usage',
        getSubcommand: () => undefined,
        run(context): Promise<void> {
            events.push('run:create');
            executions.push(context);
            return Promise.resolve();
        },
    };
    const ticket: Command = {
        requiresRepository: false,
        parseArguments(args): ReturnType<Command['parseArguments']> {
            events.push('parse:ticket');
            return {
                arguments: { command: args[0], help: args[0] === '--help' },
                rest: args.slice(1),
            };
        },
        shouldHandleHelp: (parsedArguments) => parsedArguments.arguments.help === true,
        getUsage: () => 'Ticket usage',
        getSubcommand(parsedArguments): Command {
            if (parsedArguments.arguments.command === 'create') {
                return create;
            }
            throw new UsageError('Expected create subcommand.', { usage: ticket.getUsage });
        },
        run(): Promise<void> {
            throw new Error('Grouping commands must not execute');
        },
    };

    rootCommand.getSubcommand = (parsedArguments) => {
        if (parsedArguments.arguments.command === 'ticket') {
            return ticket;
        }
        return original.getSubcommand(parsedArguments);
    };
    Runtime.createContext = (global, command) => {
        events.push('context');
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
    Log.configureLogging = () => {
        events.push('logging');
    };
    Log.output = (...messages) => {
        output.push(messages);
    };

    return {
        events,
        output,
        globals,
        executions,
        controller,
        [Symbol.dispose](): void {
            rootCommand.getSubcommand = original.getSubcommand;
            Runtime.createContext = original.createContext;
            Conf.loadConfiguration = original.loadConfiguration;
            Log.configureLogging = original.configureLogging;
            Log.output = original.output;
        },
    };
}

Deno.test('Commands::run shows help at each level without runtime setup', async () => {
    using fixture = setupCommands();
    for (
        const [args, usage, events] of [
            [['--help'], rootCommand.getUsage(), []],
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
        await run(args, fixture.controller.signal);
        expect(fixture.output).toEqual([[usage]]);
        expect(fixture.events).toEqual(events);
        expect(fixture.executions).toEqual([]);
    }
});

Deno.test('Commands::run preserves early version handling and help precedence', async () => {
    using fixture = setupCommands();
    await run(['ticket', 'create', '--version'], fixture.controller.signal);
    expect(fixture.output).toEqual([[`cr version: ${CODERAIL_VERSION}`]]);
    expect(fixture.events).toEqual([]);

    fixture.output.length = 0;
    await run(['--version', '--help'], fixture.controller.signal);
    expect(fixture.output).toEqual([[rootCommand.getUsage()]]);
    expect(fixture.events).toEqual([]);
});

Deno.test('Commands::run executes only the leaf and preserves globals and literal arguments', async () => {
    using fixture = setupCommands();
    await run(
        ['--cwd', 'project', 'ticket', 'create', '-v', '--', '--help'],
        fixture.controller.signal,
    );

    expect(fixture.events).toEqual([
        'parse:ticket',
        'parse:create',
        'context',
        'configuration',
        'logging',
        'run:create',
    ]);
    expect(fixture.output).toEqual([]);
    expect(fixture.globals[0]).toMatchObject({ cwd: 'project', verbose: true });
    expect(fixture.executions).toHaveLength(1);
    expect(fixture.executions[0]?.parsedArguments).toEqual({
        arguments: { help: false },
        rest: ['--', '--help'],
    });
    expect(fixture.executions[0]?.signal).toBe(fixture.controller.signal);
    expect(fixture.executions[0]?.context.repositoryRoot).toBe('/project');
    expect(fixture.executions[0]?.configuration.logLevel).toBe('normal');
});

Deno.test('Commands::run reports missing and unknown children before runtime setup', async () => {
    using fixture = setupCommands();
    for (const args of [[], ['unknown'], ['ticket'], ['ticket', 'unknown']]) {
        await expect(run(args, fixture.controller.signal)).rejects.toBeInstanceOf(UsageError);
    }
    expect(fixture.globals).toEqual([]);
    expect(fixture.executions).toEqual([]);
});

Deno.test('Commands::run does not execute when aborted', async () => {
    using fixture = setupCommands();
    const reason = new Error('Cancelled');
    fixture.controller.abort(reason);
    await expect(run(['ticket', 'create'], fixture.controller.signal)).rejects.toBe(reason);
    expect(fixture.executions).toEqual([]);
});
