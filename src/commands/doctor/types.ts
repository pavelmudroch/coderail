export type DoctorRepair = {
    key: string;
    description: string;
    apply(signal: AbortSignal): Promise<void>;
};

export type DoctorFailure = {
    message: string;
    details?: { label: string; value: string }[];
    repairable: boolean;
    repair?: DoctorRepair;
    /** Identifies a pending finding even if the recheck can no longer offer its repair. */
    repairKey?: string;
    manualRepair: string[];
};

export type DoctorReport = {
    failures: DoctorFailure[];
    skipped: (string | { reason: string; checks: string[] })[];
};

/** Each diagnostic phase owns its findings and can be collected independently. */
export function createDoctorReport(): DoctorReport {
    return { failures: [], skipped: [] };
}
