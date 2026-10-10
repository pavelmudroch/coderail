import type { UtilityTypes } from '@utils';

export type CommandDefinition = string[];
export type Verify = {
    pattern: string;
    commands: CommandDefinition[];
    requires?: string[];
};

export type Configuration = UtilityTypes.Prettify<{
    defaultHarness?: string;
    logLevel: 'verbose' | 'quiet' | 'normal';
    noColor: boolean;
    nonInteractive: boolean;
    verify: Verify[];
}>;
