import { expect } from '@std/expect';

import {
    type LoopOptions,
    resolveStageSettings,
} from '../../../src/commands/loop/resolve-stage-settings.ts';
import type { Configuration } from '../../../src/conf/configuration.ts';

const stages = ['implement', 'review', 'commit'] as const;

Deno.test(
    'Loop::resolveStageSettings resolves model and effort independently at every level',
    () => {
        const cases: {
            name: string;
            settings: NonNullable<Configuration['loop']>['codex'];
            options: LoopOptions;
            expected: { model?: string; effort?: string };
        }[] = [
            { name: 'native defaults', settings: undefined, options: {}, expected: {} },
            { name: 'empty settings', settings: {}, options: {}, expected: {} },
            {
                name: 'common configuration',
                settings: { model: 'saved-model', effort: 'saved-effort' },
                options: {},
                expected: { model: 'saved-model', effort: 'saved-effort' },
            },
            {
                name: 'stage configuration',
                settings: {
                    model: 'saved-model',
                    effort: 'saved-effort',
                    implementModel: 'stage-model',
                    implementEffort: 'stage-effort',
                    reviewModel: 'stage-model',
                    reviewEffort: 'stage-effort',
                    commitModel: 'stage-model',
                    commitEffort: 'stage-effort',
                },
                options: {},
                expected: { model: 'stage-model', effort: 'stage-effort' },
            },
            {
                name: 'common CLI overrides configured stage exceptions',
                settings: {
                    model: 'saved-model',
                    effort: 'saved-effort',
                    implementModel: 'stage-model',
                    implementEffort: 'stage-effort',
                    reviewModel: 'stage-model',
                    reviewEffort: 'stage-effort',
                    commitModel: 'stage-model',
                    commitEffort: 'stage-effort',
                },
                options: { model: 'cli-model', effort: 'cli-effort' },
                expected: { model: 'cli-model', effort: 'cli-effort' },
            },
            {
                name: 'stage CLI overrides common CLI',
                settings: { model: 'saved-model', effort: 'saved-effort' },
                options: {
                    model: 'cli-model',
                    effort: 'cli-effort',
                    'implement-model': 'exception-model',
                    'implement-effort': 'exception-effort',
                    'review-model': 'exception-model',
                    'review-effort': 'exception-effort',
                    'commit-model': 'exception-model',
                    'commit-effort': 'exception-effort',
                },
                expected: { model: 'exception-model', effort: 'exception-effort' },
            },
            {
                name: 'CLI model retains configured stage effort',
                settings: {
                    model: 'saved-model',
                    effort: 'saved-effort',
                    implementEffort: 'stage-effort',
                    reviewEffort: 'stage-effort',
                    commitEffort: 'stage-effort',
                },
                options: { model: 'cli-model' },
                expected: { model: 'cli-model', effort: 'stage-effort' },
            },
            {
                name: 'CLI effort retains configured stage model',
                settings: {
                    model: 'saved-model',
                    effort: 'saved-effort',
                    implementModel: 'stage-model',
                    reviewModel: 'stage-model',
                    commitModel: 'stage-model',
                },
                options: { effort: 'cli-effort' },
                expected: { model: 'stage-model', effort: 'cli-effort' },
            },
            {
                name: 'stage CLI model retains common CLI effort',
                settings: { model: 'saved-model', effort: 'saved-effort' },
                options: {
                    effort: 'cli-effort',
                    'implement-model': 'stage-cli-model',
                    'review-model': 'stage-cli-model',
                    'commit-model': 'stage-cli-model',
                },
                expected: { model: 'stage-cli-model', effort: 'cli-effort' },
            },
            {
                name: 'stage CLI effort retains common CLI model',
                settings: { model: 'saved-model', effort: 'saved-effort' },
                options: {
                    model: 'cli-model',
                    'implement-effort': 'stage-cli-effort',
                    'review-effort': 'stage-cli-effort',
                    'commit-effort': 'stage-cli-effort',
                },
                expected: { model: 'cli-model', effort: 'stage-cli-effort' },
            },
            {
                name: 'model only',
                settings: { model: 'native/model' },
                options: {},
                expected: { model: 'native/model' },
            },
            {
                name: 'effort only',
                settings: { effort: 'NativeEffort' },
                options: {},
                expected: { effort: 'NativeEffort' },
            },
            {
                name: 'CLI model only',
                settings: undefined,
                options: { model: 'cli-model' },
                expected: { model: 'cli-model' },
            },
            {
                name: 'CLI effort only',
                settings: undefined,
                options: { effort: 'cli-effort' },
                expected: { effort: 'cli-effort' },
            },
        ];
        for (const harness of ['codex', 'claude'] as const) {
            for (const stage of stages) {
                for (const { name, settings, options, expected } of cases) {
                    expect(
                        resolveStageSettings(harness, stage, { [harness]: settings }, options),
                        `${harness}/${stage}: ${name}`,
                    ).toStrictEqual(expected);
                }
            }
        }
    },
);

Deno.test(
    'Loop::resolveStageSettings isolates harnesses and stages and leaves defaults omitted',
    () => {
        expect(resolveStageSettings('codex', 'implement', undefined)).toStrictEqual({});
        expect(
            resolveStageSettings('codex', 'review', { claude: { model: 'opus', effort: 'high' } }),
        ).toStrictEqual({});
        expect(
            resolveStageSettings('claude', 'commit', {
                codex: { model: 'codex-model', effort: 'medium' },
            }),
        ).toStrictEqual({});
        const configuration = {
            codex: {
                implementModel: 'implement',
                implementEffort: 'implement-effort',
                reviewModel: 'review',
                reviewEffort: 'review-effort',
                commitModel: 'commit',
                commitEffort: 'commit-effort',
            },
            claude: { model: 'opus', effort: 'high' },
        };
        const options = { model: 'common', effort: 'common-effort', 'commit-model': 'commit-cli' };
        expect(resolveStageSettings('codex', 'implement', configuration)).toStrictEqual({
            model: 'implement',
            effort: 'implement-effort',
        });
        expect(resolveStageSettings('codex', 'review', configuration)).toStrictEqual({
            model: 'review',
            effort: 'review-effort',
        });
        expect(resolveStageSettings('codex', 'commit', configuration)).toStrictEqual({
            model: 'commit',
            effort: 'commit-effort',
        });
        expect(resolveStageSettings('claude', 'commit', configuration)).toStrictEqual({
            model: 'opus',
            effort: 'high',
        });
        expect(resolveStageSettings('codex', 'commit', configuration, options)).toStrictEqual({
            model: 'commit-cli',
            effort: 'common-effort',
        });
        expect(resolveStageSettings('codex', 'implement', configuration, options)).toStrictEqual({
            model: 'common',
            effort: 'common-effort',
        });
        expect(resolveStageSettings('codex', 'review', configuration, options)).toStrictEqual({
            model: 'common',
            effort: 'common-effort',
        });
        expect(options).toStrictEqual({
            model: 'common',
            effort: 'common-effort',
            'commit-model': 'commit-cli',
        });
        expect(configuration.codex.commitModel).toBe('commit');
        const stageOptions = {
            'implement-model': 'implement-cli',
            'implement-effort': 'implement-cli-effort',
            'review-model': 'review-cli',
            'review-effort': 'review-cli-effort',
            'commit-model': 'commit-cli',
            'commit-effort': 'commit-cli-effort',
        };
        expect(
            resolveStageSettings('codex', 'implement', configuration, stageOptions),
        ).toStrictEqual({ model: 'implement-cli', effort: 'implement-cli-effort' });
        expect(resolveStageSettings('codex', 'review', configuration, stageOptions)).toStrictEqual({
            model: 'review-cli',
            effort: 'review-cli-effort',
        });
        expect(resolveStageSettings('codex', 'commit', configuration, stageOptions)).toStrictEqual({
            model: 'commit-cli',
            effort: 'commit-cli-effort',
        });
    },
);
