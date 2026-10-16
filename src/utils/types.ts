export type Prettify<T> =
    & {
        [K in keyof T]: Prettify<T[K]>;
    }
    & NonNullable<unknown>;

export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
