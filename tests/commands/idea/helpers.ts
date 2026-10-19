import { expect } from '@std/expect';
import type { Command } from '@commands';
import { UsageError } from '../../../src/cli/usage-error.ts';

export async function runStub(command: Command): Promise<void> {
    await command.run({
        context: { currentWorkingDirectory: '/project', installRoot: '/install' },
        configuration: {
            logLevel: 'normal',
            noColor: false,
            nonInteractive: false,
            verify: [],
        },
        parsedArguments: command.parseArguments(['--help']),
        signal: new AbortController().signal,
    });
}

export function testIdeaSubcommand(name: string, Child: new () => Command): void {
    Deno.test(`Idea ${name} execution is a placeholder`, async () => {
        await runStub(new Child());
    });

    Deno.test(`Idea ${name} parses help and rejects invalid options`, () => {
        const child: Command = new Child();
        expect(child.requiresInit).toBe(false);
        expect(child.getSubcommand(child.parseArguments(['--help']))).toBeUndefined();
        for (const help of ['-h', '--help']) {
            expect(child.shouldHandleHelp(child.parseArguments([help, '--unknown']))).toBe(true);
            expect(child.shouldHandleHelp(child.parseArguments(['idea-id', help]))).toBe(true);
        }
        for (const option of ['--unknown', '-x', '--help=value']) {
            try {
                child.parseArguments([option]);
                throw new Error('Expected a usage error.');
            } catch (error) {
                expect(error).toBeInstanceOf(UsageError);
                expect((error as UsageError).usage()).toBe(child.getUsage());
            }
        }
    });
}
