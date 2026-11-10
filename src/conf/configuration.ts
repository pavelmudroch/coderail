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

export type LoopSettings = {
    model?: string;
    effort?: string;
    implementModel?: string;
    implementEffort?: string;
    reviewModel?: string;
    reviewEffort?: string;
    commitModel?: string;
    commitEffort?: string;
};

export type Configuration = UtilityTypes.Prettify<{
    defaultHarness?: string;
    logLevel: 'verbose' | 'quiet' | 'normal';
    noColor: boolean;
    nonInteractive: boolean;
    loop?: Partial<Record<'codex' | 'claude', LoopSettings>>;
    verify: Verify;
}>;
