import type { Configuration } from './configuration.ts';
import { parse } from './parse.ts';

type EnvironmentVariables = { get(key: string): string | undefined };

export type LoadContext = {
    commandLineArguments: string[];
    environmentVariables: EnvironmentVariables;
    localConfigurationFile: ReadableStream<Uint8Array> | null;
    globalConfigurationFile: ReadableStream<Uint8Array> | null;
};

export async function load(context: LoadContext): Promise<Configuration> {
    const parsedLocalConfig = context.localConfigurationFile
        ? await parse(context.localConfigurationFile)
        : null;
    const parsedGlobalConfig = context.globalConfigurationFile
        ? await parse(context.globalConfigurationFile)
        : null;

    return {} as Configuration;
}
