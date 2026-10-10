import type { Configuration } from './configuration.ts';
import { parse } from './parse.ts';
import type { ConfFileStream } from './get-file-stream.ts';

type EnvironmentVariables = { get(key: string): string | undefined };

export type LoadContext = {
    commandLineArguments: string[];
    environmentVariables: EnvironmentVariables;
    localConfigurationFile: ConfFileStream | null;
    globalConfigurationFile: ConfFileStream | null;
};

export async function load(context: LoadContext): Promise<Configuration> {
    const configuration: Configuration = {
        defaultHarness: undefined,
        logLevel: 'normal',
        noColor: false,
        nonInteractive: false,
        verify: [],
    };

    if (context.globalConfigurationFile !== null) {
        const parsedGlobalConfig = await parseConfigurationFile(context.globalConfigurationFile);
        //TODO: merge parsedGlobalConfig into configuration
    }

    if (context.localConfigurationFile !== null) {
        const parsedLocalConfig = await parseConfigurationFile(context.localConfigurationFile);
        //TODO: merge parsedLocalConfig into configuration
    }

    return configuration;
}

async function parseConfigurationFile(
    file: ConfFileStream,
): Promise<Partial<Configuration>> {
    try {
        const parsedResult = await parse(file.stream);
        // TODO: validation
        return parsedResult;
    } catch (cause) {
        throw new Error(`Invalid configuration file "${file.path}"`, { cause });
    }
}
