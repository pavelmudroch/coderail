import type { ConfigDocument, ParseResult } from './parse.ts';

function object(value: ParseResult[string] | undefined): value is ParseResult {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Stable structural identity; object key ordering is irrelevant, array ordering is significant. */
function identity(value: ParseResult[string]): string {
    if (Array.isArray(value)) {
        return `[${value.map(identity).join(',')}]`;
    }
    if (object(value)) {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, member]) => `${JSON.stringify(key)}:${identity(member)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function unique<T extends ParseResult[string]>(values: T[]): T[] {
    const seen = new Set<string>();
    return values.filter((value) => {
        const key = identity(value);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/** Merges persistent documents without changing sources or runtime loading precedence. */
export function merge(sources: readonly ConfigDocument[]): ConfigDocument {
    function combine(base: ParseResult, override: ParseResult): ParseResult {
        const result = { ...base };
        for (const [key, value] of Object.entries(override)) {
            const previous = result[key];
            const merged =
                Array.isArray(previous) && Array.isArray(value)
                    ? [...previous, ...value]
                    : object(previous) && object(value)
                      ? combine(previous, value)
                      : structuredClone(value);
            Object.defineProperty(result, key, {
                value: merged,
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        return result;
    }
    function normalize(value: ParseResult[string], path: string[]): ParseResult[string] {
        if (Array.isArray(value)) {
            // Command arguments are ordered sequences, including repeated arguments.
            if (
                path.join('.') === 'verify.pre' ||
                path.join('.') === 'verify.post' ||
                path.join('.') === 'verify.rules.commands'
            ) {
                return unique<ParseResult[string]>(value) as ParseResult[string];
            }
            const items = value.map((item) => normalize(item, path));
            return unique(items) as ParseResult[string];
        }
        if (object(value)) {
            return Object.fromEntries(
                Object.entries(value).map(([key, member]) => [
                    key,
                    normalize(member, [...path, key]),
                ]),
            );
        }
        return value;
    }
    let values: ParseResult = {};
    const comments = new Map<string, string[]>();
    for (const source of sources) {
        values = combine(values, source.values);
        for (const [path, lines] of source.comments) {
            const existing = comments.get(path) ?? [];
            if (lines.length === 0) {
                continue;
            }

            const included =
                lines.length === 0 ||
                existing.some((_, start) =>
                    lines.every((line, offset) => existing[start + offset] === line),
                );
            if (included) {
                continue;
            }
            comments.set(path, [...existing, ...lines]);
        }
    }
    return { values: normalize(values, []) as ParseResult, comments };
}
