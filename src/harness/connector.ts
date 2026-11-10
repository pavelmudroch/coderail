import type { Runner, RunRequest } from './runner/runner.ts';

export type { Runner, RunRequest };

/** Installation scope is fixed for the lifetime of a connector. */
export type InstallationTarget =
    | {
          readonly scope: 'global';
      }
    | {
          readonly scope: 'local';
          readonly projectRoot: string;
      };

/** A loaded source file or a fully materialized translation output. */
export interface ConnectorFile {
    path: string;
    content: Uint8Array;
}

/**
 * Supplies native installation translations and fresh session execution. Shared operations own
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

    run(request: RunRequest): Promise<Runner>;

    /** Converts neutral skill references to native invocation syntax. */
    translatePrompt(prompt: string): string;

    /** Source paths are relative to the named skill's directory. */
    translateSkill(name: string, files: ConnectorFile[]): Promise<ConnectorFile[]>;
    /** Native generated files eligible for retirement for this present skill only.
     * Called after successful translation; returned paths must exclude current outputs.
     * The installer removes only manifest-owned candidates.
     */
    obsoleteSkillFiles?(name: string, translatedFiles: ConnectorFile[]): string[];
    translateGlobalInstructions(file: ConnectorFile): Promise<ConnectorFile[]>;
    translateSubagent(file: ConnectorFile): Promise<ConnectorFile[]>;
}
