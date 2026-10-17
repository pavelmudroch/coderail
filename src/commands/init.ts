import { Command, ParsedArguments } from '@commands';
import { RunContext } from './helpers/command.ts';

export class Init implements Command {
    readonly requiresInit = false;

    parseArguments(args: readonly string[]): ParsedArguments {
        return { args: {}, rest: [] };
    }

    shouldHandleHelp(parsedArguments: ParsedArguments): boolean {
        return false;
    }

    getUsage(): string {
        return '';
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(context: RunContext): Promise<void> {
        return Promise.resolve();
    }
}
