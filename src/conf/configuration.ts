export type Test = {};

export type Configuration = {
    defaultHarness: string;
    logLevel: 'verbose' | 'quiet';
    noColor: boolean;
    nonInteractive: boolean;
    tests: Test[];
};
