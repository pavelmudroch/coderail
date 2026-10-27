import { expect } from '@std/expect';
import { Harness, type HarnessConnector } from '@harness';
import { Log } from '@log';
import { join } from '@std/path';
import { Install } from '../../../src/commands/install.ts';
import type { Uninstall } from '../../../src/commands/uninstall.ts';
import type { RunContext } from '../../../src/commands/helpers/command.ts';
import { UsageError } from '../../../src/cli/usage-error.ts';
import {
    InstructionOperations,
    type OperationOptions,
    type OperationResult,
} from '../../../src/instruction-operations.ts';

type Fixture = Disposable & {
    events: string[];
    messages: unknown[][];
    controller: AbortController;
    results: Map<string, OperationResult>;
    failures: Map<string, unknown>;
    constructors: Map<string, unknown>;
    options: OperationOptions[];
    bundles: string[];
    context: RunContext<ReturnType<Uninstall['parseArguments']>['args']>;
    run(): Promise<void>;
};

export function registerInstructionTests(command: Install | Uninstall): void {
    const operation = command instanceof Install ? 'install' : 'uninstall';

    const setup = (args: string[] = []): Fixture => {
        const events: string[] = [];
        const messages: unknown[][] = [];
        const controller = new AbortController();
        const original = {
            get: Harness.get,
            ...InstructionOperations,
            output: Log.output,
            error: Log.error,
        };
        const results = new Map<string, OperationResult>();
        const failures = new Map<string, unknown>();
        const constructors = new Map<string, unknown>();
        const options: OperationOptions[] = [];
        const bundles: string[] = [];
        const execute = (
            connector: HarnessConnector,
            policy: OperationOptions,
        ): Promise<OperationResult> => {
            events.push(`run:${connector.name}`);
            options.push(policy);
            connector.home;
            if (failures.has(connector.name)) return Promise.reject(failures.get(connector.name));
            return Promise.resolve(results.get(connector.name) ?? { outcomes: [] });
        };
        Harness.get = (name) => {
            events.push(`construct:${name}`);
            if (constructors.has(name)) throw constructors.get(name);
            return {
                name,
                get home(): string {
                    if (failures.get(name) === 'home') throw new Error('home resolution failed');
                    return '/home';
                },
                manifestPath: '/home/manifest',
                translateSkill: () => Promise.resolve([]),
                translateGlobalInstructions: () => Promise.resolve([]),
                translateSubagent: () => Promise.resolve([]),
                [Symbol.dispose](): void {
                    events.push(`dispose:${name}`);
                },
            };
        };
        InstructionOperations.install = (connector, bundle, policy) => {
            bundles.push(bundle);
            return execute(connector, policy);
        };
        InstructionOperations.uninstall = execute;
        Log.output = (...values) => {
            messages.push(values);
        };
        Log.error = (...values) => {
            messages.push(values);
        };
        const context: Fixture['context'] = {
            context: { currentWorkingDirectory: '/project', installRoot: '/runtime-root' },
            configuration: {
                defaultHarness: 'codex',
                logLevel: 'normal' as const,
                noColor: false,
                nonInteractive: true,
                verify: [],
            },
            parsedArguments: {
                ...command.parseArguments(args),
                args: { self: false, ...command.parseArguments(args).args },
            },
            signal: controller.signal,
        };
        return {
            events,
            messages,
            controller,
            results,
            failures,
            constructors,
            options,
            bundles,
            context,
            async run(): Promise<void> {
                await command.run(context);
            },
            [Symbol.dispose](): void {
                Harness.get = original.get;
                InstructionOperations.install = original.install;
                InstructionOperations.uninstall = original.uninstall;
                Log.output = original.output;
                Log.error = original.error;
            },
        };
    };

    Deno.test(`${operation} selects the default and passes explicit runtime policy`, async () => {
        using fixture = setup(['--force', '--no']);
        await fixture.run();
        expect(fixture.events).toEqual(['construct:codex', 'run:codex', 'dispose:codex']);
        expect(fixture.options).toEqual([{
            force: true,
            confirmation: 'no',
            nonInteractive: true,
            signal: fixture.controller.signal,
        }]);
        expect(fixture.bundles).toEqual(
            operation === 'install' ? [join('/runtime-root', 'assets', 'instructions')] : [],
        );
        expect(fixture.messages).toEqual([['codex: No instruction files affected.']]);
    });

    Deno.test(`${operation} validates every selection before constructing connectors`, async () => {
        for (const args of [[], ['codex', 'unknown'], ['--', '--help']]) {
            using fixture = setup(args);
            fixture.context.configuration.defaultHarness = '';
            await expect(fixture.run()).rejects.toBeInstanceOf(UsageError);
            expect(fixture.events).toEqual([]);
        }
        for (const name of [undefined, 'unknown']) {
            using fixture = setup();
            Object.assign(fixture.context.configuration, { defaultHarness: name });
            await expect(fixture.run()).rejects.toBeInstanceOf(UsageError);
            expect(fixture.events).toEqual([]);
        }
    });

    Deno.test(`${operation} deduplicates in first selection order and reports all outcomes`, async () => {
        using fixture = setup(['claude', 'codex', 'claude', '--force', '--yes']);
        fixture.context.configuration.defaultHarness = 'unknown';
        fixture.results.set('claude', {
            outcomes: [
                { path: 'one', status: 'installed' },
                { path: 'two', status: 'skipped' },
                { path: 'three', status: 'removed' },
                { path: 'four', status: 'already-missing' },
            ],
        });
        await fixture.run();
        expect(fixture.events).toEqual([
            'construct:claude',
            'run:claude',
            'dispose:claude',
            'construct:codex',
            'run:codex',
            'dispose:codex',
        ]);
        expect(fixture.options.every((policy) => policy.confirmation === 'yes')).toBe(true);
        expect(fixture.messages).toEqual([
            ['claude: installed "one".'],
            ['claude: skipped "two".'],
            ['claude: removed "three".'],
            ['claude: already-missing "four".'],
            ['codex: No instruction files affected.'],
        ]);
    });

    Deno.test(`${operation} reports completed outcomes and persistence errors before aggregate failure`, async () => {
        using fixture = setup(['codex', 'claude']);
        const error = new AggregateError([
            new Error('failed path'),
            new Error('persistence failed'),
        ], 'Operation failed');
        fixture.results.set('codex', {
            outcomes: [{ path: 'completed', status: 'removed' }],
            error,
        });
        await expect(fixture.run()).rejects.toThrow(`${operation} failed for: codex.`);
        expect(fixture.messages).toEqual([
            ['codex: removed "completed".'],
            [
                `codex: ${operation} failed.`,
                error,
            ],
            ...error.errors.map((failure: unknown) => [`codex: ${operation} failed.`, failure]),
            ['claude: No instruction files affected.'],
        ]);
        expect(fixture.events.at(-1)).toBe('dispose:claude');
    });

    Deno.test(`${operation} isolates construction, home resolution and thrown operation failures`, async () => {
        for (const mode of ['constructor', 'home', 'operation']) {
            using fixture = setup(['codex', 'claude']);
            const error = new Error('selected failure');
            if (mode === 'constructor') fixture.constructors.set('codex', error);
            else fixture.failures.set('codex', mode === 'home' ? 'home' : error);
            await expect(fixture.run()).rejects.toThrow(`${operation} failed for: codex.`);
            expect(fixture.events).toContain('run:claude');
            expect(fixture.events.filter((event) => event.startsWith('dispose:'))).toEqual(
                mode === 'constructor' ? ['dispose:claude'] : ['dispose:codex', 'dispose:claude'],
            );
            expect(fixture.messages[0]?.[0]).toBe(`codex: ${operation} failed.`);
        }
    });

    Deno.test(`${operation} defaults to prompting and lets declines succeed`, async () => {
        using fixture = setup(['codex']);
        fixture.results.set('codex', { outcomes: [{ path: 'protected', status: 'skipped' }] });
        await fixture.run();
        expect(fixture.options[0]).toEqual({
            force: false,
            confirmation: 'prompt',
            nonInteractive: true,
            signal: fixture.controller.signal,
        });
        expect(fixture.messages).toEqual([['codex: skipped "protected".']]);
    });

    Deno.test(`${operation} propagates cancellation and stops later selections`, async () => {
        for (const rejects of [true, false]) {
            using fixture = setup(['codex', 'claude']);
            const reason = new Error('cancelled');
            InstructionOperations[operation] = () => {
                fixture.controller.abort(reason);
                return rejects ? Promise.reject(reason) : Promise.resolve({ outcomes: [] });
            };
            await expect(fixture.run()).rejects.toBe(reason);
            expect(fixture.events).toEqual(['construct:codex', 'dispose:codex']);
            expect(fixture.messages).toEqual([]);
        }
    });

    Deno.test(`${operation} checks cancellation before construction`, async () => {
        using fixture = setup(['codex', 'claude']);
        fixture.controller.abort();
        await expect(fixture.run()).rejects.toBe(fixture.controller.signal.reason);
        expect(fixture.events).toEqual([]);
    });
}
