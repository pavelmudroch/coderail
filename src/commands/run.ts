import { Cli } from '@cli';
import { Conf } from '@conf';
import { Log } from '@log';
import { Runtime } from '@runtime';
import { CODERAIL_VERSION } from '../version.ts';
import type { Command, CommandArguments } from './get-command.ts';
import { rootCommand } from './root-command.ts';

export async function run(args: readonly string[], signal: AbortSignal): Promise<void> {
    const rootArguments = rootCommand.parseArguments(args);
    const global = rootArguments.arguments;
    let command: Command = rootCommand;
    let parsedArguments: CommandArguments = rootArguments;

    while (true) {
        if (command.shouldHandleHelp(parsedArguments)) {
            Log.output(command.getUsage());
            return;
        }

        if (command === rootCommand && Cli.shouldHandleVersion(global)) {
            Log.output(`cr version: ${CODERAIL_VERSION}`);
            return;
        }

        const subcommand = command.getSubcommand(parsedArguments);
        if (subcommand === undefined) {
            break;
        }

        command = subcommand;
        parsedArguments = command.parseArguments(parsedArguments.rest);
    }

    const context = await Runtime.createContext(global, command);
    const configuration = await Conf.loadConfiguration(context, global);

    Log.configureLogging(configuration);
    signal.throwIfAborted();

    await command.run({ context, configuration, parsedArguments, signal });
}
