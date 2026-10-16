type UsageErrorOptions = {
    usage: () => string;
};

export class UsageError extends Error {
    readonly usage: () => string;

    constructor(message: string, options: UsageErrorOptions) {
        super(message);
        this.usage = options.usage;
    }
}
