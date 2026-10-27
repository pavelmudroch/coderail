/** A loaded source file or a fully materialized translation output. */
export interface ConnectorFile {
    path: string;
    content: Uint8Array;
}

/**
 * Supplies native locations and byte-based translations only. Shared operations own
 * discovery/loading, aggregate path validation, manifests, and filesystem mutation.
 * Input records and bytes remain caller-owned and must not be modified.
 * Translations may produce multiple files, with all bytes materialized and paths
 * relative to home. Unsupported assets must reject explicitly; an empty result
 * must not silently represent unsupported input.
 */
export interface HarnessConnector extends Disposable {
    readonly name: string;
    /** Absolute installation home. */
    readonly home: string;
    /** Absolute installation manifest path. */
    readonly manifestPath: string;

    /** Source paths are relative to the named skill's directory. */
    translateSkill(name: string, files: ConnectorFile[]): Promise<ConnectorFile[]>;
    translateGlobalInstructions(file: ConnectorFile): Promise<ConnectorFile[]>;
    translateSubagent(file: ConnectorFile): Promise<ConnectorFile[]>;
}
