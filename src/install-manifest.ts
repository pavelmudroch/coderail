import { capture } from './install-manifest/capture.ts';
import { inspect } from './install-manifest/inspect.ts';
import { load } from './install-manifest/load.ts';
import { save } from './install-manifest/save.ts';

export interface ManifestFile {
    path: string;
    checksum: string;
    size: number;
}

export interface Manifest {
    version: 1;
    files: ManifestFile[];
}

export interface Inspection {
    path: string;
    status: 'unchanged' | 'modified' | 'missing';
}

export interface InstallManifest {
    capture(root: string, paths: string[]): Promise<Manifest>;
    inspect(root: string, manifest: Manifest): Promise<Inspection[]>;
    load(path: string): Promise<Manifest | null>;
    save(path: string, manifest: Manifest): Promise<void>;
}

export const InstallManifest: InstallManifest = { capture, inspect, load, save };
