import { expect } from '@std/expect';

import { Plans } from '../../../src/commands/archive/plans.ts';
import { archiveFiles, batch, expectedPlans, withArchiveFixture } from '../../archive/fixtures.ts';
import { archiveTextOutput } from './fixtures.ts';

Deno.test('archive plans lists plans, their parents, and associated artifacts', async () => {
    const plans = new Plans();
    expect(plans.requiresInit).toBe(false);
    expect(plans.getSubcommand()).toBeUndefined();
    expect(plans.getUsage()).toContain('cr archive plans [--help] [--json] <batch-id>');
    expect(plans.shouldHandleHelp(plans.parseArguments(['--help']))).toBe(true);
    expect(plans.shouldHandleHelp(plans.parseArguments([batch]))).toBe(false);
    expect(() => plans.parseArguments([])).toThrow('Missing required arguments.');

    await withArchiveFixture(archiveFiles, async (root) => {
        const output = (...args: string[]): Promise<string> =>
            archiveTextOutput(plans, root, ...args);
        const [parent, child] = expectedPlans as [
            (typeof expectedPlans)[number],
            (typeof expectedPlans)[number],
        ];
        expect(await output(batch)).toBe(
            [
                `${parent.title}  ${parent.path}`,
                ...parent.artifacts.map((artifact) => `  ${artifact}`),
                `${child.title}  ${child.path}`,
                `  Parent: ${parent.path}`,
                ...child.artifacts.map((artifact) => `  ${artifact}`),
                '',
            ].join('\n'),
        );
        expect(await output('2026-11-25_zulu')).toBe('No archived plans in "2026-11-25_zulu".\n');
        expect(JSON.parse(await output(batch, '--json'))).toEqual(expectedPlans);
    });
});
