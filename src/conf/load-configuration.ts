import type { GlobalArguments } from '@commands';
import type { RuntimeContext } from '@runtime';
import { join } from '@std/path';

import type { Configuration } from './configuration.ts';
import { type ConfFileStream, getFileStream } from './get-file-stream.ts';
import { getGlobalConfigurationFile } from './get-global-configuration-file.ts';
import { getLocalConfigurationFile } from './get-local-configuration-file.ts';
import { parse, type ParsedConf } from './parse.ts';

type EnvironmentVariables = { get(key: string): string | undefined };

/** Loads configuration from every supported source in precedence order. */
export async function loadConfiguration(
    context: RuntimeContext,
    global: GlobalArguments,
): Promise<Configuration> {
    const configuration = createConfiguration();

    using globalConfigurationFile = await getGlobalConfigurationFile(context.installRoot);
    if (globalConfigurationFile !== null) {
        const parsedGlobalConfig = await parseConfigurationFile(globalConfigurationFile);
        mergeConfiguration(configuration, parsedGlobalConfig);
    }

    const localConfigurationFile =
        context.repositoryRoot === undefined
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

/** Fresh defaults, optionally applying explicit CLI flags without reading any source. */
export function createConfiguration(global?: GlobalArguments): Configuration {
    const configuration: Configuration = {
        defaultHarness: undefined,
        logLevel: 'normal',
        noColor: false,
        nonInteractive: false,
        verify: { pre: undefined, post: undefined, rules: [] },
    };
    if (global) {
        mergeConfiguration(configuration, parseGlobalArguments(global));
    }
    return configuration;
}

/** Validate every available source; a single failure discards the entire merged result. */
export async function diagnoseConfiguration(
    context: { installRoot?: string; repositoryRoots: string[]; validationRoots?: string[] },
    global: GlobalArguments,
    signal?: AbortSignal,
): Promise<{ configuration: Configuration; errors: Error[] }> {
    const configuration = createConfiguration();
    const errors: Error[] = [];
    async function readConfiguration(path: string): Promise<Partial<Configuration>> {
        let info: Deno.FileInfo;
        try {
            info = await Deno.stat(path);
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return {};
            }
            throw error;
        }
        signal?.throwIfAborted();
        if (!info.isFile) {
            throw new Error(
                `Unsupported configuration file type at "${path}": expected a regular file`,
            );
        }
        using file = await getFileStream(path);
        return file === null ? {} : await parseConfigurationFile(file);
    }
    async function attempt(
        label: string,
        read: () => Promise<Partial<Configuration>>,
    ): Promise<void> {
        signal?.throwIfAborted();
        try {
            mergeConfiguration(configuration, await read());
            signal?.throwIfAborted();
        } catch (cause) {
            signal?.throwIfAborted();
            errors.push(new Error(`${label}: ${String(cause)}`, { cause }));
        }
    }
    const installRoot = context.installRoot;
    if (installRoot !== undefined) {
        await attempt('Global configuration', () => readConfiguration(join(installRoot, 'config')));
    }
    for (const root of new Set(context.validationRoots)) {
        if (context.repositoryRoots.includes(root)) {
            continue;
        }
        await attempt(`Source repository configuration at "${root}"`, async () => {
            await readConfiguration(join(root, '.coderail', 'config'));
            return {};
        });
    }
    for (const root of new Set(context.repositoryRoots)) {
        await attempt(`Project configuration at "${root}"`, () =>
            readConfiguration(join(root, '.coderail', 'config')),
        );
    }
    await attempt('Environment configuration', () =>
        Promise.resolve(parseEnvironmentVariables(Deno.env)),
    );
    mergeConfiguration(configuration, parseGlobalArguments(global));
    return { configuration: errors.length ? createConfiguration(global) : configuration, errors };
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
    if (nonInteractive !== undefined && (nonInteractive === 'true' || nonInteractive === '1')) {
        result.nonInteractive = true;
    }

    if (accumulatedErrors.length > 0) {
        throw new Error('Invalid environment variable overrides', { cause: accumulatedErrors });
    }

    return result;
}

async function parseConfigurationFile(file: ConfFileStream): Promise<Partial<Configuration>> {
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
        if (typeof value !== 'string') {
            report(path, 'Expected a string');
        }
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

    function verifyRule(value: unknown, path: Path): void {
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

    function loopSettings(value: unknown, path: Path): void {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            report(path, 'Expected an object');
            return;
        }
        for (const [key, member] of Object.entries(value)) {
            const memberPath = [...path, key];
            switch (key) {
                case 'model':
                case 'effort':
                case 'implementModel':
                case 'implementEffort':
                case 'reviewModel':
                case 'reviewEffort':
                case 'commitModel':
                case 'commitEffort':
                    if (typeof member !== 'string' || member.trim() === '') {
                        report(memberPath, 'Expected a nonblank string');
                    }
                    break;
                default:
                    report(memberPath, 'Unknown property', 'key');
            }
        }
    }

    for (const [key, value] of Object.entries(possibleConfiguration)) {
        const path = [key];
        switch (key) {
            case 'loop':
                if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                    report(path, 'Expected an object');
                    break;
                }
                for (const [harness, settings] of Object.entries(value)) {
                    const nested = [...path, harness];
                    if (harness === 'codex' || harness === 'claude') {
                        loopSettings(settings, nested);
                    } else {
                        report(nested, 'Unknown property', 'key');
                    }
                }
                break;
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
                if (typeof value !== 'boolean') {
                    report(path, 'Expected a boolean');
                }
                break;
            case 'verify':
                if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                    report(path, 'Expected an object');
                    break;
                }
                for (const [member, entry] of Object.entries(value)) {
                    const nested = [...path, member];
                    if (member === 'rules') {
                        array(entry, nested, verifyRule);
                    } else if (member === 'pre' || member === 'post') {
                        array(entry, nested, (command, commandPath) =>
                            array(command, commandPath, string),
                        );
                    } else {
                        report(nested, 'Unknown property', 'key');
                    }
                }
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
    if (override.loop !== undefined) {
        const loop = (base.loop ??= {});
        for (const harness of ['codex', 'claude'] as const) {
            if (override.loop[harness] !== undefined) {
                loop[harness] = { ...loop[harness], ...override.loop[harness] };
            }
        }
    }
    if (override.verify !== undefined) {
        base.verify.rules.push(...(override.verify.rules ?? []));
        for (const phase of ['pre', 'post'] as const) {
            if (override.verify[phase] !== undefined) {
                (base.verify[phase] ??= []).push(...override.verify[phase]);
            }
        }
    }
}
