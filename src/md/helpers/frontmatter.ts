export type Scalar = string | number | boolean;
export type Frontmatter = Record<string, Scalar | Scalar[]>;

/** Parses the text inside frontmatter delimiters; error lines are relative to that text. */
export function parseFrontmatter(content: string): Frontmatter {
    const result: Frontmatter = {};
    let array: Scalar[] | undefined;
    let indentation: string | undefined;
    let lineNumber = 0;

    function fail(message: string): never {
        throw new SyntaxError(`${message} at line ${lineNumber}`);
    }

    function scalar(source: string): Scalar {
        const value = source.trim();
        if (value.startsWith('"')) {
            let parsed: string;
            try {
                parsed = JSON.parse(value);
            } catch {
                fail('Invalid quoted string');
            }
            if (/[\r\n]/.test(parsed)) {
                fail('Expected a single-line string');
            }
            return parsed;
        }
        if (value.startsWith("'")) {
            if (!/^'(?:[^']|'')*'$/.test(value)) fail('Invalid quoted string');
            return value.slice(1, -1).replaceAll("''", "'");
        }
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
            const number = Number(value);
            if (!Number.isFinite(number)) fail('Expected a finite number');
            return number;
        }
        if (value === 'true' || value === 'false') return value === 'true';
        if (
            value === '' || /^[\[\]{}|>!&*#%@`]/.test(value) ||
            /:\s|:$|\s#/.test(value) || /^(?:-|\?)(?:\s|$)/.test(value)
        ) fail('Unsupported value');
        return value;
    }

    function inlineArray(source: string): Scalar[] {
        if (!source.endsWith(']')) fail('Unfinished array');
        const values = source.slice(1, -1);
        if (values.trim() === '') return [];
        const items: Scalar[] = [];
        let start = 0;
        let quote: '"' | "'" | undefined;
        for (let index = 0; index < values.length; index++) {
            const character = values.charAt(index);
            if (quote === '"' && character === '\\') {
                index++;
            } else if (quote !== undefined && character === quote) {
                if (quote === "'" && values.charAt(index + 1) === "'") index++;
                else quote = undefined;
            } else if (quote === undefined && (character === '"' || character === "'")) {
                // Quotes delimit a string only at the beginning of an item.
                if (values.slice(start, index).trim() === '') quote = character;
            } else if (quote === undefined && character === ',') {
                items.push(scalar(values.slice(start, index)));
                start = index + 1;
            } else if (quote === undefined && /[\[\]{}]/.test(character)) {
                fail('Nested arrays and objects are unsupported');
            }
        }
        if (quote !== undefined) fail('Unfinished quoted string');
        items.push(scalar(values.slice(start)));
        return items;
    }

    for (const line of content.split(/\r?\n/)) {
        lineNumber++;
        if (line.includes('\r')) fail('Bare carriage return');
        if (line.trim() === '') continue;
        const item = /^( +)-[ \t]+(.*)$/.exec(line);
        if (item) {
            if (array === undefined) fail('Unexpected array item');
            if (indentation !== undefined && indentation !== item[1]) {
                fail('Inconsistent array indentation');
            }
            indentation = item[1];
            // deno-lint-ignore no-non-null-assertion -- The item expression always captures its value.
            array.push(scalar(item[2]!));
            continue;
        }
        if (array !== undefined && array.length === 0) fail('Expected array item');
        array = undefined;
        indentation = undefined;
        const property =
            /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*)|[ \t]*)$/
                .exec(line);
        if (!property) fail('Expected a property');
        // deno-lint-ignore no-non-null-assertion -- The property expression always captures its key.
        const sourceKey = property[1]!;
        const key = /^[\"']/.test(sourceKey) ? String(scalar(sourceKey)) : sourceKey;
        if (Object.hasOwn(result, key)) fail('Duplicate key');
        const source = (property[2] ?? '').trim();
        let value: Scalar | Scalar[];
        if (source === '') {
            array = [];
            value = array;
        } else {
            value = source.startsWith('[') ? inlineArray(source) : scalar(source);
        }
        Object.defineProperty(result, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    if (array !== undefined && array.length === 0) fail('Expected array item');
    return result;
}

/** Serializes attributes without delimiters or a trailing newline. */
export function stringifyFrontmatter(frontmatter: Frontmatter): string {
    function scalar(value: Scalar): string {
        if (typeof value === 'string') {
            if (/[\r\n]/.test(value)) throw new TypeError('Multiline strings are unsupported');
            return JSON.stringify(value);
        }
        if (typeof value === 'boolean') return String(value);
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Object.is(value, -0) ? '-0' : String(value);
        }
        throw new TypeError('Expected a string, finite number, or boolean');
    }

    const lines: string[] = [];
    for (const [key, value] of Object.entries(frontmatter)) {
        const name = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : scalar(key);
        if (Array.isArray(value)) {
            if (value.length === 0) lines.push(`${name}: []`);
            else {
                lines.push(`${name}:`);
                for (const item of value) lines.push(`  - ${scalar(item)}`);
            }
        } else lines.push(`${name}: ${scalar(value)}`);
    }
    return lines.join('\n');
}
