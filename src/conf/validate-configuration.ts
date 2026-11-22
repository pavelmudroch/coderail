import type { Configuration } from './configuration.ts';
import type { ParsedConf, ParseResult } from './parse.ts';

/** Validates project settings without supplying runtime defaults. */
export function validateConfiguration(parsed: ParsedConf): Partial<Configuration> {
    const configuration = parsed.toObject();
    // Older installations and projects may still have settings for the removed command.
    delete configuration.loop;
    const errors: Error[] = [];
    if (!validateConfigurationResult(parsed, configuration, errors)) {
        throw new Error('Invalid configuration', { cause: errors });
    }
    return configuration;
}

function validateConfigurationResult(
    result: ParsedConf,
    possibleConfiguration: ParseResult,
    accumulatedErrors: Error[],
): possibleConfiguration is Partial<Configuration> {
    const initialErrorCount = accumulatedErrors.length;

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
