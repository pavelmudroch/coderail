import type { UtilityTypes } from '@utils';

export type CommandDefinition = string[];
export type VerifyRule = {
    pattern: string;
    commands: CommandDefinition[];
    requires?: string[];
};

export type Verify = {
    rules: VerifyRule[];
    pre?: CommandDefinition[];
    post?: CommandDefinition[];
};

export type Configuration = UtilityTypes.Prettify<{
    defaultHarness?: string;
    logLevel: 'verbose' | 'quiet' | 'normal';
    noColor: boolean;
    nonInteractive: boolean;
    verify: Verify;
}>;
