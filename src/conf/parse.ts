export type Scalar = string | number | boolean | null;
type BracketArray = (Scalar | BracketArray)[];
export type ParseResult = {
    [key: string]: ParseResult | Scalar | ParseResult[] | BracketArray;
};

interface Position {
    /** 1-based physical line. */
    line: number;
    /** 1-based UTF-16 code-unit column; a tab counts as one. */
    column: number;
}

interface SourceRange {
    start: Position;
    /** Exclusive end position. */
    end: Position;
}

interface KeyNode {
    name: string;
    range: SourceRange;
}

interface PropertyNode {
    /** Assignment key or occurrences of this namespace segment. */
    keys: KeyNode[];
    value: ValueNode;
}

interface HeaderNode {
    kind: 'object' | 'element';
    path: KeyNode[];
    /** Includes the opening and closing brackets. */
    range: SourceRange;
}

interface ObjectNode {
    kind: 'object';
    properties: PropertyNode[];
    /** Absent for the root and implicit namespace parents. */
    header?: HeaderNode;
}

interface ScalarNode {
    kind: 'scalar';
    value: Scalar;
    /** Includes string quotes and escape sequences. */
    range: SourceRange;
}

interface BracketArrayNode {
    kind: 'array';
    items: (ScalarNode | BracketArrayNode)[];
    /** Location of the opening bracket. */
    range: Pick<SourceRange, 'start'>;
}

interface ObjectArrayNode {
    kind: 'object-array';
    items: (ObjectNode & { header: HeaderNode })[];
}

type ValueNode = ScalarNode | BracketArrayNode | ObjectNode | ObjectArrayNode;

export type MetaType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

export interface Meta {
    key: string;
    line: number;
    column: number;
    type: MetaType;
}

export interface ParsedConf<T extends ParseResult = ParseResult> {
    /** Returns fresh objects and arrays with camelCase keys; mutations do not affect source metadata. */
    toObject(): T;
    /**
     * Looks up original file locations using camelCase or source property names and zero-based array indices.
     * Missing/invalid paths, the root, and array items requested as keys return undefined.
     * Values point to their token or explicit header; implicit namespaces point to
     * their first key occurrence. Keys point to the explicit header segment when
     * available, otherwise their first occurrence.
     */
    getMeta(path: string | readonly (string | number)[], part?: 'value' | 'key'): Meta | undefined;
}

type ArrayFrame = { node: BracketArrayNode; needsComma: boolean };

function horizontal(character: string): boolean {
    return character === ' ' || character === '\t';
}

function digit(character: string): boolean {
    return character >= '0' && character <= '9';
}

function nameCharacter(character: string): boolean {
    return digit(character) || (character >= 'A' && character <= 'Z') ||
        (character >= 'a' && character <= 'z') || character === '_';
}

function camelCase(key: string): string {
    return key.replace(
        /(?<=[A-Za-z0-9])_+([A-Za-z0-9])/g,
        (_, character: string) => character.toUpperCase(),
    );
}

function define(target: ParseResult, key: string, value: ParseResult[string]): void {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

/** Converts a located tree into ordinary configuration objects and arrays. */
function toObject(root: ObjectNode): ParseResult {
    function object(node: ObjectNode): ParseResult {
        const result: ParseResult = {};
        for (const property of node.properties) {
            // deno-lint-ignore no-non-null-assertion -- Every property is created with its assignment key or namespace segment.
            define(result, camelCase(property.keys[0]!.name), value(property.value));
        }
        return result;
    }

    function bracketArray(node: BracketArrayNode): BracketArray {
        return node.items.map((item) => item.kind === 'scalar' ? item.value : bracketArray(item));
    }

    function value(node: ValueNode): ParseResult[string] {
        switch (node.kind) {
            case 'scalar':
                return node.value;
            case 'array':
                return bracketArray(node);
            case 'object':
                return object(node);
            case 'object-array':
                return node.items.map(object);
        }
    }

    return object(root);
}

export async function parse(file: ReadableStream<Uint8Array>): Promise<ParsedConf> {
    const result: ObjectNode = { kind: 'object', properties: [] };
    let target = result;
    const indexes = new WeakMap<ObjectNode, Map<string, PropertyNode>>();
    const arrays: ArrayFrame[] = [];
    let key: KeyNode | undefined;
    let value: ScalarNode | BracketArrayNode | undefined;
    let complete = false;
    let lineNumber = 0;
    let text = '';
    let cursor = 0;

    function fail(message: string): never {
        throw new SyntaxError(`${message} at line ${lineNumber}, column ${cursor + 1}`);
    }

    function whitespace(): void {
        // deno-lint-ignore no-non-null-assertion -- cursor is within the string bounds.
        for (; cursor < text.length && horizontal(text[cursor]!); cursor++) { /* advance */ }
    }

    function position(): Position {
        return { line: lineNumber, column: cursor + 1 };
    }

    function name(): KeyNode {
        const start = cursor;
        const location = position();
        // deno-lint-ignore no-non-null-assertion -- cursor is within the string bounds.
        for (; cursor < text.length && nameCharacter(text[cursor]!); cursor++) { /* advance */ }
        if (cursor === start) fail('Expected name');
        return {
            name: text.slice(start, cursor),
            range: { start: location, end: position() },
        };
    }

    function members(node: ObjectNode): Map<string, PropertyNode> {
        let index = indexes.get(node);
        if (index === undefined) {
            index = new Map();
            indexes.set(node, index);
        }
        return index;
    }

    function namespace(header: HeaderNode): void {
        let parent = result;
        const element = header.kind === 'element';
        for (let index = 0; index < header.path.length; index++) {
            // deno-lint-ignore no-non-null-assertion -- index is within the header path bounds.
            const part = header.path[index]!;
            const final = index === header.path.length - 1;
            const properties = members(parent);
            const propertyName = camelCase(part.name);
            let property = properties.get(propertyName);
            if (property === undefined) {
                property = {
                    keys: [part],
                    value: final && element
                        ? { kind: 'object-array', items: [] }
                        : { kind: 'object', properties: [] },
                };
                parent.properties.push(property);
                properties.set(propertyName, property);
            } else {
                property.keys.push(part);
            }
            const member = property.value;
            if (member.kind === 'array' || member.kind === 'object-array') {
                if (member.kind !== 'object-array' || (final && !element)) {
                    fail('Incompatible array namespace');
                }
                if (final) member.items.push({ kind: 'object', properties: [], header });
                // deno-lint-ignore no-non-null-assertion -- Object arrays are populated when their first element header is parsed.
                parent = member.items[member.items.length - 1]!;
            } else {
                if (member.kind !== 'object' || (final && element)) {
                    fail('Incompatible namespace');
                }
                parent = member;
                if (final) {
                    if (parent.header !== undefined) fail('Repeated object header');
                    parent.header = header;
                }
            }
        }
        target = parent;
    }

    function string(): string {
        let decoded = '';
        cursor++;
        for (; cursor < text.length; cursor++) {
            // deno-lint-ignore no-non-null-assertion -- cursor is within the string bounds.
            const character = text[cursor]!;
            if (character === '"') {
                cursor++;
                return decoded;
            }
            if (character === '\\') {
                cursor++;
                switch (text[cursor]) {
                    case '"':
                    case '\\':
                    case '/':
                        decoded += text[cursor];
                        break;
                    case 'b':
                        decoded += '\b';
                        break;
                    case 'f':
                        decoded += '\f';
                        break;
                    case 'n':
                        decoded += '\n';
                        break;
                    case 'r':
                        decoded += '\r';
                        break;
                    case 't':
                        decoded += '\t';
                        break;
                    case 'u': {
                        let hex = 0;
                        for (let index = 0; index < 4; index++) {
                            cursor++;
                            const character = text[cursor];
                            if (character === undefined) fail('Unfinished Unicode escape');
                            let code: number;
                            if (digit(character)) code = character.charCodeAt(0) - 48;
                            else if (character >= 'a' && character <= 'f') {
                                code = character.charCodeAt(0) - 87;
                            } else if (character >= 'A' && character <= 'F') {
                                code = character.charCodeAt(0) - 55;
                            } else fail('Invalid Unicode escape');
                            hex = hex * 16 + code;
                        }
                        decoded += String.fromCharCode(hex);
                        break;
                    }
                    default:
                        fail('Unsupported or unfinished escape');
                }
            } else {
                if (character.charCodeAt(0) < 32) fail('Raw string control');
                decoded += character;
            }
        }
        fail('Unfinished string');
    }

    function scalar(): Scalar {
        if (text[cursor] === '"') return string();
        let token = '';
        // deno-lint-ignore no-non-null-assertion -- scan calls scalar only while cursor is within the string bounds.
        const character = text[cursor]!;
        const numeric = digit(character) || character === '-';
        const literal = text[cursor] === 't' ? 'true' : text[cursor] === 'f' ? 'false' : 'null';
        if (!numeric && text[cursor] !== literal[0]) fail('Invalid literal');
        let state:
            | 'start'
            | 'sign'
            | 'zero'
            | 'integer'
            | 'separator'
            | 'point'
            | 'fraction'
            | 'fractionSeparator' = 'start';
        for (; cursor < text.length; cursor++) {
            // deno-lint-ignore no-non-null-assertion -- cursor is within the string bounds.
            const character = text[cursor]!;
            if (
                horizontal(character) || character === '#' || character === ',' || character === ']'
            ) break;
            if (numeric) {
                if (state === 'start' && character === '-') state = 'sign';
                else if ((state === 'start' || state === 'sign') && digit(character)) {
                    state = character === '0' ? 'zero' : 'integer';
                } else if ((state === 'integer' || state === 'separator') && digit(character)) {
                    state = 'integer';
                } else if ((state === 'zero' || state === 'integer') && character === '.') {
                    state = 'point';
                } else if (state === 'integer' && character === '_') {
                    state = 'separator';
                } else if (
                    (state === 'point' || state === 'fraction' || state === 'fractionSeparator') &&
                    digit(character)
                ) {
                    state = 'fraction';
                } else if (state === 'fraction' && character === '_') {
                    state = 'fractionSeparator';
                } else fail('Invalid number');
                if (character !== '_') token += character;
            } else {
                if (character !== literal[token.length]) fail('Invalid literal');
                token += character;
            }
        }
        if (numeric) {
            if (state !== 'zero' && state !== 'integer' && state !== 'fraction') {
                fail('Unfinished number');
            }
            const number = Number(token);
            if (!Number.isFinite(number)) fail('Nonfinite number');
            return number;
        }
        if (token === 'true') return true;
        if (token === 'false') return false;
        if (token === 'null') return null;
        fail('Invalid literal');
    }

    function accept(parsed: ScalarNode | BracketArrayNode): void {
        const frame = arrays[arrays.length - 1];
        if (frame !== undefined) {
            frame.node.items.push(parsed);
            frame.needsComma = true;
        } else {
            value = parsed;
            complete = true;
        }
    }

    function scan(line: string): void {
        text = line;
        cursor = 0;
        lineNumber++;
        whitespace();
        let header: HeaderNode | undefined;
        if (arrays.length === 0) {
            if (cursor === text.length || text[cursor] === '#') {
                // Comments still obey physical line-ending rules.
            } else if (text[cursor] === '[') {
                const start = position();
                cursor++;
                const element = text[cursor] === '[';
                if (element) cursor++;
                whitespace();
                const path = [name()];
                for (; text[cursor] === '.';) {
                    cursor++;
                    path.push(name());
                }
                whitespace();
                if (text[cursor] !== ']') fail('Expected closing header');
                cursor++;
                if (element) {
                    if (text[cursor] !== ']') fail('Expected closing element header');
                    cursor++;
                }
                header = {
                    kind: element ? 'element' : 'object',
                    path,
                    range: { start, end: position() },
                };
            } else {
                key = name();
                whitespace();
                if (text[cursor] !== '=') fail('Expected assignment');
                cursor++;
                complete = false;
            }
        }
        let comment = false;
        for (; cursor < text.length; cursor++) {
            // deno-lint-ignore no-non-null-assertion -- cursor is within the string bounds.
            const character = text[cursor]!;
            if (character === '\r') fail('Bare carriage return');
            if (comment || horizontal(character)) continue;
            if (character === '#') {
                comment = true;
                continue;
            }
            if (header || complete) fail('Unexpected trailing text');
            const frame = arrays[arrays.length - 1];
            if (frame && character === ']') {
                arrays.pop();
                accept(frame.node);
            } else if (frame && frame.needsComma) {
                if (character !== ',') fail('Expected comma');
                frame.needsComma = false;
            } else if (character === '[') {
                arrays.push({
                    node: {
                        kind: 'array',
                        items: [],
                        range: { start: position() },
                    },
                    needsComma: false,
                });
            } else {
                const start = position();
                const parsed = scalar();
                accept({ kind: 'scalar', value: parsed, range: { start, end: position() } });
                cursor--;
            }
        }
        if (header) {
            namespace(header);
        } else if (key !== undefined && arrays.length === 0) {
            if (!complete || value === undefined) fail('Expected value');
            const properties = members(target);
            const propertyName = camelCase(key.name);
            if (properties.has(propertyName)) fail('Duplicate assignment');
            const property = { keys: [key], value };
            target.properties.push(property);
            properties.set(propertyName, property);
            key = undefined;
            complete = false;
        }
    }

    const reader = file.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let pending: Uint8Array[] = [];
    let length = 0;

    function line(bytes: Uint8Array, terminated: boolean): void {
        if (terminated && bytes[bytes.length - 1] === 13) {
            bytes = bytes.subarray(0, bytes.length - 1);
        }
        let decoded: string;
        try {
            decoded = decoder.decode(bytes);
        } catch {
            throw new SyntaxError(`Invalid UTF-8 at line ${lineNumber + 1}`);
        }
        scan(decoded);
    }

    function flush(terminated: boolean): void {
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const part of pending) {
            bytes.set(part, offset);
            offset += part.length;
        }
        pending = [];
        length = 0;
        line(bytes, terminated);
    }

    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const bytes = chunk.value;
            let start = 0;
            for (let index = 0; index < bytes.length; index++) {
                if (bytes[index] !== 10) continue;
                const part = bytes.subarray(start, index);
                if (pending.length === 0) line(part, true);
                else {
                    pending.push(part);
                    length += part.length;
                    flush(true);
                }
                start = index + 1;
            }
            if (start < bytes.length) {
                const part = bytes.subarray(start);
                pending.push(part);
                length += part.length;
            }
        }
        if (length > 0) flush(false);
        if (arrays.length > 0) fail('Unfinished array');
    } catch (error) {
        try {
            reader.releaseLock();
        } catch {
            // Preserve the parsing or read failure if cleanup also fails.
        }
        throw error;
    }
    reader.releaseLock();
    function getMeta(
        path: string | readonly (string | number)[],
        part: 'value' | 'key' = 'value',
    ): Meta | undefined {
        const segments = typeof path === 'string' ? path.split('.') : path;
        if (segments.length === 0) return undefined;
        let property: PropertyNode | undefined = indexes.get(result)?.get(
            camelCase(String(segments[0])),
        );
        if (property === undefined) return undefined;
        // deno-lint-ignore no-non-null-assertion -- Every property is created with at least one key.
        const sourcePath: (string | number)[] = [property.keys[0]!.name];
        let node: ValueNode = property.value;
        // deno-lint-ignore no-non-null-assertion -- Every property is created with at least one key.
        let location = property.keys[0]!.range.start;
        for (const segment of segments.slice(1)) {
            if (node.kind === 'object') {
                property = indexes.get(node)?.get(camelCase(String(segment)));
                if (property === undefined) return undefined;
                // deno-lint-ignore no-non-null-assertion -- Every property is created with at least one key.
                sourcePath.push(property.keys[0]!.name);
                node = property.value;
                // deno-lint-ignore no-non-null-assertion -- Every property is created with at least one key.
                location = property.keys[0]!.range.start;
            } else if (node.kind === 'array' || node.kind === 'object-array') {
                if (typeof segment === 'string' && !/^(0|[1-9][0-9]*)$/.test(segment)) {
                    return undefined;
                }
                const index = Number(segment);
                if (!Number.isSafeInteger(index) || index < 0 || index >= node.items.length) {
                    return undefined;
                }
                // deno-lint-ignore no-non-null-assertion -- The index was checked above, and parser-created arrays are dense.
                node = node.items[index]!;
                property = undefined;
                sourcePath.push(index);
            } else {
                return undefined;
            }
        }
        if (part === 'key') {
            if (property === undefined) return undefined;
            location = node.kind === 'object' && node.header !== undefined
                // deno-lint-ignore no-non-null-assertion -- Headers are parsed with at least one path segment.
                ? node.header.path[node.header.path.length - 1]!.range.start
                // deno-lint-ignore no-non-null-assertion -- Every property is created with at least one key.
                : property.keys[0]!.range.start;
        } else {
            switch (node.kind) {
                case 'scalar':
                case 'array':
                    location = node.range.start;
                    break;
                case 'object':
                    location = node.header?.range.start ?? location;
                    break;
                case 'object-array':
                    // deno-lint-ignore no-non-null-assertion -- Object arrays always contain their first parsed element.
                    location = node.items[0]!.header.range.start;
                    break;
            }
        }
        let type: MetaType;
        if (node.kind === 'scalar') {
            type = node.value === null ? 'null' : typeof node.value as MetaType;
        } else {
            type = node.kind === 'object' ? 'object' : 'array';
        }
        return { key: sourcePath.join('.'), line: location.line, column: location.column, type };
    }

    return { toObject: () => toObject(result), getMeta };
}
