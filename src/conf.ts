import type { Configuration } from './conf/configuration.ts';
import { load, type LoadContext } from './conf/load.ts';
import { getGlobalConfigurationFile } from './conf/get-global-configuration-file.ts';
import { getLocalConfigurationFile } from './conf/get-local-configuration-file.ts';
import { parse, type ParseResult } from './conf/parse.ts';
import { ConfFileStream } from './conf/get-file-stream.ts';

export type { Configuration } from './conf/configuration.ts';
export type { ConfFileStream } from './conf/get-file-stream.ts';
export type { ParseResult } from './conf/parse.ts';

// TODO: parse: filter metadata and return parsed object on success

export interface Conf {
    /**
     * Loads configuration from the appropriate sources, in the correct precedence order.
     * Higher to lower precedence:
     * 1. Environment variables
     * 2. Command-line arguments
     * 3. Local repo configuration file
     * 4. Global configuration file
     * 5. Default values
     * @param context The context containing sources for command-line arguments, environment variables, and configuration files.
     * @returns A promise that resolves to the loaded configuration.
     */
    load(context: LoadContext): Promise<Configuration>;
    /**
     * Retrieves the local configuration file.
     * @param repositoryRoot Path to current repository root
     * @returns Readable stream of configuration file, or null if it doesn't exist.
     */
    getLocalConfigurationFile(repositoryRoot: string): Promise<ConfFileStream | null>;
    /**
     * Retrieves the global configuration file.
     * @returns Readable stream of configuration file, or null if it doesn't exist.
     */
    getGlobalConfigurationFile(): Promise<ConfFileStream | null>;
    /**
     * Parses the given configuration file.
     * @param file Readable stream of the configuration file.
     * @returns A promise that resolves to the parsed configuration.
     */
    parse(file: ReadableStream<Uint8Array>): Promise<ParseResult>;
}

export const Conf: Conf = {
    getLocalConfigurationFile,
    getGlobalConfigurationFile,
    load,
    parse,
};
