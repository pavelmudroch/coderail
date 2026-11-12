import { Log } from '@log';

import type { DoctorRepair } from './types.ts';

export type DoctorRepairResult = {
    key: string;
    description: string;
    error?: string;
};

export async function runRepairs(
    actions: DoctorRepair[],
    signal: AbortSignal,
): Promise<DoctorRepairResult[]> {
    signal.throwIfAborted();
    const results: DoctorRepairResult[] = [];
    for (const action of actions) {
        signal.throwIfAborted();
        Log.notice(`Repairing: ${action.description}`);
        const result: DoctorRepairResult = { key: action.key, description: action.description };
        try {
            await action.apply(signal);
        } catch (error) {
            signal.throwIfAborted();
            result.error = error instanceof Error ? error.message : String(error);
        }
        signal.throwIfAborted();
        results.push(result);
    }
    return results;
}
