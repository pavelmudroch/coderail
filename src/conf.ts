import type { Configuration } from './conf/configuration.ts';
import { loadConfiguration } from './conf/load.ts';
import { getGlobalConfigurationFile } from './conf/get-global-configuration-file.ts';
import { getLocalConfigurationFile } from './conf/get-local-configuration-file.ts';
import { parse, type ParsedConf } from './conf/parse.ts';
import { ConfFileStream } from './conf/get-file-stream.ts';
import type { GlobalArguments } from '@cli';
import type { RuntimeContext } from '@runtime';

export type { Configuration };
export type { ConfFileStream };
export type { Meta, MetaType, ParsedConf, ParseResult } from './conf/parse.ts';

export interface Conf {
    loadConfiguration(
        context: RuntimeContext,
        global: GlobalArguments,
    ): Promise<Configuration>;
    /**
     * Retrieves the local configuration file.
     * @param repositoryRoot Path to current repository root
     * @returns Readable stream of configuration file, or null if it doesn't exist.
     */
    getLocalConfigurationFile(repositoryRoot: string): Promise<ConfFileStream | null>;
    /**
     * Retrieves the global configuration file.
     * @param installRoot Path to the installation root directory.
     * @returns Readable stream of configuration file, or null if it doesn't exist.
     */
    getGlobalConfigurationFile(installRoot: string): Promise<ConfFileStream | null>;
    /**
     * Parses the given configuration file.
     * @param file Readable stream of the configuration file.
     * @returns A promise that resolves to a helper for configuration values and source locations.
     */
    parse(file: ReadableStream<Uint8Array>): Promise<ParsedConf>;
}

export const Conf: Conf = {
    loadConfiguration,
    getLocalConfigurationFile,
    getGlobalConfigurationFile,
    parse,
};
