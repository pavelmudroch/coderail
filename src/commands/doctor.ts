import { Command, ParsedArguments } from '@commands';
import { RunContext } from './helpers/command.ts';

export class Doctor implements Command {
    readonly requiresInit = false;

    parseArguments(_args: readonly string[]): ParsedArguments {
        return { args: {}, rest: [] };
    }

    shouldHandleHelp(_parsedArguments: ParsedArguments): boolean {
        return false;
    }

    getUsage(): string {
        return '';
    }

    getSubcommand(): Command | undefined {
        return undefined;
    }

    run(_context: RunContext): Promise<void> {
        return Promise.resolve();
    }
}
