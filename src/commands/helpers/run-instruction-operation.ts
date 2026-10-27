import type { Command, RunContext } from './command.ts';
import { Harness } from '@harness';
import { Cli } from '@cli';
import { Log } from '@log';
import { join } from '@std/path';
import { InstructionOperations, type OperationOptions } from '../../instruction-operations.ts';

export type InstructionArguments = {
    help: boolean;
    force: boolean;
    yes: boolean;
    no: boolean;
    harnesses: string[];
};

export async function runInstructionOperation(
    operation: 'install' | 'uninstall',
    command: Command,
    { context, configuration, parsedArguments: { args }, signal }: RunContext<InstructionArguments>,
): Promise<void> {
    const selections = args.harnesses.length ? args.harnesses : [configuration.defaultHarness];
    const names = new Set<string>();
    for (const name of selections) {
        if (name === undefined || name === '') {
            Cli.raiseUsageError('No harness specified and no default harness configured.', command);
        }
        if (!Harness.names.includes(name)) {
            Cli.raiseUsageError(`Unknown harness "${name}".`, command);
        }
        names.add(name);
    }
    const options: OperationOptions = {
        force: args.force,
        confirmation: args.yes ? 'yes' : args.no ? 'no' : 'prompt',
        nonInteractive: configuration.nonInteractive,
        signal,
    };
    const failed: string[] = [];
    for (const name of names) {
        signal.throwIfAborted();
        try {
            using connector = Harness.get(name);
            const result = operation === 'install'
                ? await InstructionOperations.install(
                    connector,
                    join(context.installRoot, 'assets', 'instructions'),
                    options,
                )
                : await InstructionOperations.uninstall(connector, options);
            signal.throwIfAborted();
            for (const outcome of result.outcomes) {
                Log.output(`${name}: ${outcome.status} "${outcome.path}".`);
            }
            if (result.error !== undefined) {
                throw result.error;
            }
            if (result.outcomes.length === 0) {
                Log.output(`${name}: No instruction files affected.`);
            }
        } catch (error) {
            signal.throwIfAborted();
            reportError(`${name}: ${operation} failed.`, error);
            failed.push(name);
        }
    }
    if (failed.length) throw new Error(`${operation} failed for: ${failed.join(', ')}.`);
}

function reportError(message: string, error: unknown): void {
    Log.error(message, error);
    if (error instanceof AggregateError) {
        for (const failure of error.errors) {
            reportError(message, failure);
        }
    }
}
