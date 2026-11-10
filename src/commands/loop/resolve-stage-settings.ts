import type { Configuration } from '@conf';

export type LoopStage = 'implement' | 'review' | 'commit';
export type LoopOptions = Partial<
    Record<'model' | 'effort' | `${LoopStage}-${'model' | 'effort'}`, string>
>;

/** Resolves native settings independently; CLI common values override saved stage exceptions. */
export function resolveStageSettings(
    harness: 'codex' | 'claude',
    stage: LoopStage,
    configuration?: Configuration['loop'],
    options: LoopOptions = {},
): { model?: string; effort?: string } {
    const settings = configuration?.[harness];
    const model =
        options[`${stage}-model`] ??
        options.model ??
        settings?.[`${stage}Model`] ??
        settings?.model;
    const effort =
        options[`${stage}-effort`] ??
        options.effort ??
        settings?.[`${stage}Effort`] ??
        settings?.effort;
    return {
        ...(model === undefined ? {} : { model }),
        ...(effort === undefined ? {} : { effort }),
    };
}
