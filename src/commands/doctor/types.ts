export type DoctorFailure = {
    message: string;
    repairable: boolean;
    manualRepair: string[];
};

export type DoctorReport = {
    failures: DoctorFailure[];
    skipped: string[];
};

/** Each diagnostic phase owns its findings and can be collected independently. */
export function createDoctorReport(): DoctorReport {
    return { failures: [], skipped: [] };
}
