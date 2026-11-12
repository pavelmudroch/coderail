import type { ConfigDocument, ParseResult } from './parse.ts';

function sourceKey(key: string): string {
    return key.replace(/(?<=[A-Za-z0-9])[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Serializes values and supported comments using the custom configuration syntax. */
export function stringify(document: ConfigDocument): string {
    const lines: string[] = [];
    function comment(path: string[]): void {
        for (const line of document.comments.get(path.join('.')) ?? []) {
            lines.push(`# ${line}`);
        }
    }
    function literal(value: ParseResult[string]): string {
        if (Array.isArray(value)) {
            return `[${value.map(literal).join(', ')}]`;
        }
        if (typeof value === 'number') {
            if (Object.is(value, -0)) {
                return '-0';
            }
            // The parser accepts decimal notation only, even when JS uses an exponent.
            const [mantissa, exponent] = String(value).split('e');
            if (exponent !== undefined) {
                const negative = value < 0;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- split always returns a mantissa.
                const unsigned = mantissa!.replace('-', '');
                const digits = unsigned.replace('.', '');
                const dot = unsigned.indexOf('.');
                const point = (dot === -1 ? unsigned.length : dot) + Number(exponent);
                const decimal =
                    point <= 0
                        ? `0.${'0'.repeat(-point)}${digits}`
                        : digits + '0'.repeat(point - digits.length);
                return `${negative ? '-' : ''}${decimal}`;
            }
        }
        return JSON.stringify(value);
    }
    function object(values: ParseResult, path: string[], inArray: boolean): void {
        for (const [key, value] of Object.entries(values)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                continue;
            }
            if (
                Array.isArray(value) &&
                value.some(
                    (item) => item !== null && typeof item === 'object' && !Array.isArray(item),
                )
            ) {
                continue;
            }
            if (!inArray && !Array.isArray(value)) {
                comment([...path, key]);
            }
            lines.push(`${sourceKey(key)} = ${literal(value)}`);
        }
        for (const [key, value] of Object.entries(values)) {
            const nested = [...path, key];
            const header = nested.map(sourceKey).join('.');
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                        lines.push(`[[${header}]]`);
                        object(item, nested, true);
                    }
                }
            } else if (value !== null && typeof value === 'object') {
                if (!inArray) {
                    comment(nested);
                }
                lines.push(`[${header}]`);
                object(value, nested, inArray);
            }
        }
    }
    object(document.values, [], false);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}
