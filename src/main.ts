import { Cli } from '@cli';
import { type Command, Commands, type ParsedArguments } from '@commands';
import { Log } from '@log';
import { Runtime } from '@runtime';
import { Conf } from '@conf';

async function main(): Promise<void> {
    using signalHandlers = Runtime.registerSignalHandlers();

    try {
        const globalCommand = Commands.cr();
        const globalArguments = globalCommand.parseArguments(Deno.args);

        Log.level = globalArguments.args.verbose
            ? 'verbose'
            : globalArguments.args.quiet
            ? 'quiet'
            : 'normal';
        Log.noColor = globalArguments.args.noColor;

        let command: Command = globalCommand;
        let parsedArguments: ParsedArguments = globalArguments;

        while (true) {
            if (command.shouldHandleHelp(parsedArguments)) {
                Log.output(command.getUsage());
                return;
            }

            if (command === globalCommand && globalArguments.args.version) {
                Log.output(`Coderail version ${Cli.version}`);
                return;
            }

            const subCommand = command.getSubcommand(parsedArguments);
            if (subCommand === undefined) {
                break;
            }

            command = subCommand;
            parsedArguments = command.parseArguments(parsedArguments.rest);
        }

        const context = await Runtime.createContext(globalArguments.args, command);
        const configuration = await Conf.loadConfiguration(context, globalArguments.args);

        Log.level = configuration.logLevel;
        Log.noColor = configuration.noColor;
        signalHandlers.signal.throwIfAborted();

        await command.run({
            context,
            configuration,
            parsedArguments,
            signal: signalHandlers.signal,
        });
    } catch (error) {
        reportFailure(error, signalHandlers.signal);
    } finally {
        await Runtime.cleanup();
    }
}

function reportFailure(error: unknown, signal: AbortSignal): void {
    if (Cli.isUsageError(error)) {
        Deno.exitCode = 2;
        Log.error(error);
        Log.info(error.usage());
        return;
    }

    if (signal.aborted) {
        Deno.exitCode = 3;
        Log.warn('Operation was aborted');
        return;
    }

    if (Deno.exitCode === 0) {
        Deno.exitCode = 1;
    }

    Log.error(error);
    Log.trace(error);
}

await main();
