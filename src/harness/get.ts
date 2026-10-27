export interface HarnessConnector extends Disposable {}

export function get(harness: string): HarnessConnector {
    return {} as HarnessConnector;
}
