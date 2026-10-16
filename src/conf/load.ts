import type { Configuration } from './configuration.ts';
import { getGlobalConfigurationFile } from './get-global-configuration-file.ts';
import { getLocalConfigurationFile } from './get-local-configuration-file.ts';
import { parse, ParsedConf } from './parse.ts';
import type { ConfFileStream } from './get-file-stream.ts';
import type { GlobalArguments } from '@cli';
import type { RuntimeContext } from '@runtime';

type EnvironmentVariables = { get(key: string): string | undefined };

/** Loads configuration from every supported source in precedence order. */
export async function loadConfiguration(
    context: RuntimeContext,
    global: GlobalArguments,
): Promise<Configuration> {
    const configuration: Configuration = {
        defaultHarness: undefined,
        logLevel: 'normal',
        noColor: false,
        nonInteractive: false,
        verify: [],
    };

    using globalConfigurationFile = await getGlobalConfigurationFile(context.installRoot);
    if (globalConfigurationFile !== null) {
        const parsedGlobalConfig = await parseConfigurationFile(globalConfigurationFile);
        mergeConfiguration(configuration, parsedGlobalConfig);
    }

    const localConfigurationFile = context.repositoryRoot === undefined
        ? null
        : await getLocalConfigurationFile(context.repositoryRoot);
    using localConfiguration = localConfigurationFile;
    if (localConfiguration !== null) {
        const parsedLocalConfig = await parseConfigurationFile(localConfiguration);
        mergeConfiguration(configuration, parsedLocalConfig);
    }

    const parsedEnvironmentVariables = parseEnvironmentVariables(Deno.env);
    mergeConfiguration(configuration, parsedEnvironmentVariables);

    mergeConfiguration(configuration, parseGlobalArguments(global));

    return configuration;
}

function parseGlobalArguments(global: GlobalArguments): Partial<Configuration> {
    const result: Partial<Configuration> = {};

    if (global.verbose) {
        result.logLevel = 'verbose';
    } else if (global.quiet) {
        result.logLevel = 'quiet';
    }
    if (global.noColor) {
        result.noColor = true;
    }
    if (global.nonInteractive) {
        result.nonInteractive = true;
    }

    return result;
}

function parseEnvironmentVariables(env: EnvironmentVariables): Partial<Configuration> {
    const accumulatedErrors: Error[] = [];
    const result: Partial<Configuration> = {};
    const defaultHarness = env.get('DEFAULT_HARNESS');
    if (defaultHarness !== undefined) {
        result.defaultHarness = defaultHarness;
    }

    const logLevel = env.get('LOG_LEVEL');
    if (logLevel !== undefined) {
        if (logLevel !== 'normal' && logLevel !== 'verbose' && logLevel !== 'quiet') {
            accumulatedErrors.push(new Error(`Invalid LOG_LEVEL: ${logLevel}`));
        } else {
            result.logLevel = logLevel;
        }
    }

    const noColor = env.get('NO_COLOR');
    if (noColor !== undefined) {
        result.noColor = noColor === 'true' || noColor === '1';
    }

    const nonInteractive = env.get('NON_INTERACTIVE');
    if (nonInteractive !== undefined) {
        result.nonInteractive = nonInteractive === 'true' || nonInteractive === '1';
    }

    if (accumulatedErrors.length > 0) {
        throw new Error('Invalid environment variable overrides', { cause: accumulatedErrors });
    }

    return result;
}

async function parseConfigurationFile(
    file: ConfFileStream,
): Promise<Partial<Configuration>> {
    try {
        const parsedResult = await parse(file.stream);
        const accumulatedErrors: Error[] = [];
        if (!validateConfigurationResult(parsedResult, accumulatedErrors)) {
            const cause = accumulatedErrors;
            throw new Error(`Invalid configuration file "${file.path}"`, { cause });
        }
        return parsedResult.toObject();
    } catch (cause) {
        throw new Error(`Invalid configuration file "${file.path}"`, { cause });
    }
}

function validateConfigurationResult(
    result: ParsedConf,
    accumulatedErrors: Error[],
): result is ParsedConf<Partial<Configuration>> {
    const initialErrorCount = accumulatedErrors.length;
    const possibleConfiguration = result.toObject();

    type Path = (string | number)[];

    function report(path: Path, message: string, part: 'value' | 'key' = 'value'): void {
        const meta = result.getMeta(path, part);
        const location = meta === undefined ? '' : ` at line ${meta.line}, column ${meta.column}`;
        accumulatedErrors.push(new Error(`${meta?.key ?? path.join('.')}: ${message}${location}`));
    }

    function string(value: unknown, path: Path): void {
        if (typeof value !== 'string') report(path, 'Expected a string');
    }

    function array(
        value: unknown,
        path: Path,
        validateItem: (item: unknown, path: Path) => void,
    ): void {
        if (!Array.isArray(value)) {
            report(path, 'Expected an array');
            return;
        }
        value.forEach((item, index) => validateItem(item, [...path, index]));
    }

    function verify(value: unknown, path: Path): void {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            report(path, 'Expected an object');
            return;
        }
        for (const required of ['pattern', 'commands']) {
            if (!Object.hasOwn(value, required)) {
                report([...path, required], `Missing required property "${required}"`);
            }
        }
        for (const [key, member] of Object.entries(value)) {
            const memberPath = [...path, key];
            switch (key) {
                case 'pattern':
                    string(member, memberPath);
                    break;
                case 'commands':
                    array(member, memberPath, (command, commandPath) => {
                        array(command, commandPath, string);
                    });
                    break;
                case 'requires':
                    array(member, memberPath, string);
                    break;
                default:
                    report(memberPath, 'Unknown property', 'key');
            }
        }
    }

    for (const [key, value] of Object.entries(possibleConfiguration)) {
        const path = [key];
        switch (key) {
            case 'defaultHarness':
                string(value, path);
                break;
            case 'logLevel':
                if (value !== 'verbose' && value !== 'quiet' && value !== 'normal') {
                    report(path, 'Expected "verbose", "quiet", or "normal"');
                }
                break;
            case 'noColor':
            case 'nonInteractive':
                if (typeof value !== 'boolean') report(path, 'Expected a boolean');
                break;
            case 'verify':
                array(value, path, verify);
                break;
            default:
                report(path, 'Unknown property', 'key');
        }
    }

    return accumulatedErrors.length === initialErrorCount;
}

function mergeConfiguration(base: Configuration, override: Partial<Configuration>): void {
    if (override.defaultHarness !== undefined) {
        base.defaultHarness = override.defaultHarness;
    }
    if (override.logLevel !== undefined) {
        base.logLevel = override.logLevel;
    }
    if (override.noColor !== undefined) {
        base.noColor = override.noColor;
    }
    if (override.nonInteractive !== undefined) {
        base.nonInteractive = override.nonInteractive;
    }
    if (override.verify !== undefined) {
        base.verify.push(...override.verify);
    }
}
