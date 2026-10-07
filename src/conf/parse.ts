type Scalar = string | number | boolean | null;
type BracketArray = (Scalar | BracketArray)[];
export type ParseResult = {
    [key: string]: ParseResult | Scalar | ParseResult[] | BracketArray;
};

type ArrayFrame = { values: BracketArray; needsComma: boolean };

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

function define(target: ParseResult, key: string, value: ParseResult[string]): void {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}

export async function parse(file: ReadableStream<Uint8Array>): Promise<ParseResult> {
    const result: ParseResult = {};
    let target = result;
    const explicit = new WeakSet<ParseResult>();
    const objectArrays = new WeakSet<ParseResult[]>();
    const arrays: ArrayFrame[] = [];
    let key: string | undefined;
    let value: Scalar | BracketArray = null;
    let complete = false;
    let lineNumber = 0;
    let text = '';
    let cursor = 0;

    function fail(message: string): never {
        throw new SyntaxError(`${message} at line ${lineNumber}, column ${cursor + 1}`);
    }

    function whitespace(): void {
        for (; cursor < text.length && horizontal(text[cursor]); cursor++) { /* advance */ }
    }

    function name(): string {
        const start = cursor;
        for (; cursor < text.length && nameCharacter(text[cursor]); cursor++) { /* advance */ }
        if (cursor === start) fail('Expected name');
        return text.slice(start, cursor);
    }

    function namespace(path: string[], element: boolean): void {
        let parent = result;
        for (let index = 0; index < path.length; index++) {
            const part = path[index];
            const final = index === path.length - 1;
            if (!Object.hasOwn(parent, part)) {
                define(parent, part, final && element ? [] : {});
                if (final && element) objectArrays.add(parent[part] as ParseResult[]);
            }
            const member = parent[part];
            if (Array.isArray(member)) {
                if (!objectArrays.has(member as ParseResult[]) || (final && !element)) {
                    fail('Incompatible array namespace');
                }
                const objects = member as ParseResult[];
                if (final) objects.push({});
                parent = objects[objects.length - 1];
            } else {
                if (member === null || typeof member !== 'object' || (final && element)) {
                    fail('Incompatible namespace');
                }
                parent = member;
                if (final) {
                    if (explicit.has(parent)) fail('Repeated object header');
                    explicit.add(parent);
                }
            }
        }
        target = parent;
    }

    function string(): string {
        let decoded = '';
        cursor++;
        for (; cursor < text.length; cursor++) {
            const character = text[cursor];
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
                            if (cursor === text.length) fail('Unfinished Unicode escape');
                            const character = text[cursor];
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
        const numeric = digit(text[cursor]) || text[cursor] === '-';
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
            const character = text[cursor];
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

    function accept(parsed: Scalar | BracketArray): void {
        if (arrays.length > 0) {
            const frame = arrays[arrays.length - 1];
            frame.values.push(parsed);
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
        let header: { path: string[]; element: boolean } | undefined;
        if (arrays.length === 0) {
            if (cursor === text.length || text[cursor] === '#') {
                // Comments still obey physical line-ending rules.
            } else if (text[cursor] === '[') {
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
                header = { path, element };
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
            const character = text[cursor];
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
                accept(frame.values);
            } else if (frame && frame.needsComma) {
                if (character !== ',') fail('Expected comma');
                frame.needsComma = false;
            } else if (character === '[') {
                arrays.push({ values: [], needsComma: false });
            } else {
                accept(scalar());
                cursor--;
            }
        }
        if (header) {
            namespace(header.path, header.element);
        } else if (key !== undefined && arrays.length === 0) {
            if (!complete) fail('Expected value');
            if (Object.hasOwn(target, key)) fail('Duplicate assignment');
            define(target, key, value);
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
    return result;
}
