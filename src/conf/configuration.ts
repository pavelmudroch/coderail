type CommandDefinition = string[];
export type Verify = {
    pattern: string;
    commands: CommandDefinition[];
    requires?: string[];
};

export type Configuration = {
    defaultHarness: string;
    logLevel: 'verbose' | 'quiet';
    noColor: boolean;
    nonInteractive: boolean;
    verify: Verify[];
};
