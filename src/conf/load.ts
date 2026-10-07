import type { Configuration } from './configuration.ts';

type EnvironmentVariables = { get(key: string): string | undefined };

export type LoadContext = {
    commandLineArguments: string[];
    environmentVariables: EnvironmentVariables;
    localConfigurationFile: ReadableStream<Uint8Array> | null;
    globalConfigurationFile: ReadableStream<Uint8Array> | null;
};

export async function load(context: LoadContext): Promise<Configuration> {
    return {} as Configuration;
}
