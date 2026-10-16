export function stringifyMessages(messages: unknown[]): string {
    const stringified: string[] = [];
    for (const message of messages) {
        const normalized = normalizeMessage(message);
        if (normalized === null) {
            continue;
        }

        stringified.push(normalized);
    }
    return stringified.join(': ');
}

function normalizeMessage(message: unknown): string | null {
    if (message === undefined) {
        return null;
    }

    if (message === null) {
        return 'null';
    }

    if (message instanceof Error) {
        const messages = [message.message];
        const cause = normalizeMessage(message.cause);
        if (cause !== null) {
            messages.push(cause);
        }
        return messages.join(': ');
    }

    switch (typeof message) {
        case 'string':
            return message;
        case 'number':
        case 'boolean':
        case 'bigint':
        case 'symbol':
            return String(message);
        case 'object':
            return JSON.stringify(message);
    }
    return null;
}
