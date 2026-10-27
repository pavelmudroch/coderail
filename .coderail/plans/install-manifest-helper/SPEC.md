## Problem Statement

Instruction installation and uninstallation need a recorded baseline to detect
files edited after installation. Without that baseline, callers cannot distinguish
unchanged installed files from files requiring approval before replacement or
removal.

## Goal

Provide a generic helper that captures, persists, and inspects installed file
state. Keep approval decisions and changes to installed files with callers.

## Solution Overview

Expose an `InstallManifest` facade in `src/install-manifest.ts`, backed by
implementations under `src/install-manifest/`. Callers supply the installation
root, explicit relative file paths, and manifest storage path.

After a successful installation, callers capture the installed files and save the
manifest. Before subsequent changes, callers load and inspect the baseline.
Inspection reports unchanged, modified, or missing files without updating that
baseline. Existing destinations absent from the manifest remain untracked.

## Requirements

1. Persist a plain JSON object with `version: 1` and a `files` array. Each entry
   contains only its relative `path`, SHA-256 `checksum`, and byte `size`. Do not
   persist the installation root or discover installation locations.
2. `load` returns `null` only when the manifest path is absent. Invalid JSON,
   invalid schema, unsupported versions, and other filesystem failures throw.
3. `save` validates the manifest and writes it using the repository's staged-write
   mechanism. It does not create missing parent directories.
4. `capture` records only explicitly listed regular files. Missing files,
   symlinks, other file types, invalid paths, and filesystem errors throw.
5. `inspect` returns one result per recorded entry, in manifest order:
   - `unchanged`: a regular file has the recorded size and checksum.
   - `modified`: either value differs, or the leaf is now a symlink, directory,
     or other non-regular object.
   - `missing`: the leaf or an ordinary ancestor below the root is absent.
6. Inspection must not follow a replacement leaf symlink. Invalid paths and
   access failures throw; they must not be converted to `missing` or `modified`.
7. Neither capture nor inspection changes installed files. Inspection must not
   mutate the supplied manifest or accept current edits as a new baseline.
8. Empty manifests and empty capture lists are valid. Duplicate paths are invalid.
   Preserve entry order through capture, persistence, and inspection.

## Implementation Decisions

### Public contract

Follow the repository's matching interface/value facade convention, with types
exported through the facade:

```ts
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
    load(path: string): Promise<Manifest | null>;
    save(path: string, manifest: Manifest): Promise<void>;
    capture(root: string, paths: string[]): Promise<Manifest>;
    inspect(root: string, manifest: Manifest): Promise<Inspection[]>;
}
```

Export `const InstallManifest: InstallManifest` implementing this contract.
Keep validation, safe path resolution, and file fingerprinting internal to this
module family. Do not add a configurable class or harness dependency.

### Manifest validation and persistence

Validate runtime inputs to `load`, `save`, and `inspect`; TypeScript types do not
replace validation. Require plain objects with exactly the documented properties,
version `1`, an array of valid entries, unique paths, lowercase 64-character
hexadecimal checksums, and nonnegative safe-integer sizes. Reject invalid capture
paths and duplicates before reading files.

Use JSON serialization and preserve array order. Formatting is not a public
contract. Reuse `Fs.read` and `Fs.write` for manifest I/O; `Fs.write` stages content
in a lock file and renames it over the destination. Propagate write and lock
failures using existing cleanup conventions. Catch `Deno.errors.NotFound` only
around reading the manifest when implementing the missing-manifest result.

### Relative paths and containment

Use canonical slash-separated paths relative to the supplied root. Reject empty
paths, absolute or drive-qualified paths, backslashes, NUL, empty components, and
`.` or `..` components. Do not silently normalize invalid paths. Apply the same
rules to captured paths and persisted entries.

The installation root must resolve to an existing directory. Canonicalize it
with `realPath`, allowing a caller-supplied root alias such as a platform temporary
directory symlink. Resolve entries beneath that root with separator-aware
containment checks. Do not rely on `Path.isWithin` alone: its current prefix check
also accepts sibling names sharing the root prefix.

Use `lstat` to examine descendants. Reject symlink ancestors below the canonical
root, including dangling ones; never traverse them. Non-directory ancestors and
access errors throw. During inspection, an absent ordinary descendant means
`missing`; a symlink at the recorded leaf means `modified`. A missing or invalid
root throws even for an empty manifest.

These checks provide path containment at observation time, not protection against
concurrent filesystem replacement between checks and reads.

### File state and caller responsibilities

Hash raw bytes using built-in SHA-256 and encode lowercase hexadecimal. Derive
captured size and checksum from the same byte content. Size differences may
short-circuit inspection hashing; equal sizes still require checksum comparison.
Do not use timestamps or permissions as modification signals.

Avoid `Fs.exists`, which hides access errors and follows symlinks. Preserve
underlying filesystem errors; contextual errors may use the existing
`Error(message, { cause })` convention. Exact error text is not a public contract.

Callers own approval, installation, replacement, deletion, and manifest entry
updates. They retain old entries for skipped files, remove entries after
successful removals, and record new baselines only after successful installation
or replacement. Capturing user-edited files explicitly accepts those bytes as the
new baseline. No result implies that untracked destinations are safe to change.

## Testing Decisions

Use `Deno.test`, `@std/expect`, real temporary directories, and `try/finally`
cleanup, following existing filesystem tests. Test public behavior through the
facade where practical, with operation tests under `tests/install-manifest/`.

Cover:

- Round-trip persistence, preserved order, empty manifests, absent manifest,
  malformed JSON, unsupported versions, and invalid schema fields or entries.
- Invalid checksums and sizes, duplicate paths, unknown properties, and runtime
  validation of both saving and inspection inputs.
- Known SHA-256 values for empty, text, and binary files; byte sizes and explicit
  selection of files, excluding unlisted files.
- Unchanged files, different-size edits, equal-size edits, missing files and
  ancestors, and unchanged manifest data after inspection.
- Capture rejection of missing files and non-regular leaves; inspection of
  replacement directories and live or dangling leaf symlinks without traversal.
- Invalid relative paths, sibling-prefix escape attempts, symlink ancestors,
  invalid roots, and legitimate caller root aliases.
- Propagation of read/write failures, non-directory ancestor errors, and access
  errors using reliable fixtures or existing stubbing patterns where platform
  permissions make real access-denial fixtures unreliable.

After implementation, run:

```sh
cr test ./src/install-manifest.ts ./src/install-manifest
cr test ./tests/install-manifest
```

The current `.coderail/test_map` only lints and formats top-level source facades.
Nested source files additionally run corresponding tests and coverage; test-file
entries also run mutation testing. Keep operation tests aligned with implementation
paths so these mappings apply. Run explicit test paths as above to ensure facade
checks do not substitute for behavior tests. No test-map change is required.

## Out of Scope

- Wiring the helper into install, uninstall, init, or harness workflows.
- Approval prompts, overwrite/removal policies, or untracked-file discovery.
- Choosing installation roots or manifest storage locations.
- Directory tracking, following descendant symlinks, or content restoration.
- Manifest migrations, partial inspection results on errors, filesystem watchers,
  cross-process transactions, or race-free filesystem access.
- Fixing unrelated path helpers or changing existing in-progress work.

## Assumptions

- The approved idea is one implementation scope; no parent or child idea or
  existing specification is present.
- Callers record only successfully installed files as their baseline.
- Canonical relative paths, strict schema validation, stable entry order, and an
  existing installation root are acceptable helper contracts.
- Files fit in memory for built-in digest computation; streaming large-file
  hashing is not required for installed instruction assets.

## Further Notes

The working tree contains in-progress harness and command changes. Preserve them;
this helper remains independent of their final design. Repository research found
no existing checksum or manifest persistence abstraction to extend.

The specification is ready for implementation. Inspection remains a snapshot;
callers must account for files changing before their subsequent actions.

## Ticket Plan

No tickets created. This specification covers the helper and its tests as one
implementation scope.
