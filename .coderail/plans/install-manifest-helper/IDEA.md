---
title: Install manifest helper
status: ready
---

## Desired Outcome

Provide an install manifest helper that records installed file paths, checksums,
and sizes so instruction installation and uninstallation can detect changed files
before updating or removing them.

## Understanding

- Installation and uninstallation will consume the helper; implementing those
  workflows is outside this idea's scope.
- Changed installed files require an approval decision before replacement or
  removal.
- Existing `Path` exposes directory constants and path containment checks; `Fs`
  exposes filesystem operations. Modules use a public facade with implementations
  in a matching directory.

## Constraints

- Preserve existing work, including in-progress harness and command changes.
- Forge the design before implementation.

## Decisions

- The helper records and inspects file state. Callers own approval decisions and
  installation, replacement, and removal of installed files.
- Use a generic `InstallManifest` facade in `src/install-manifest.ts`, with
  implementations under `src/install-manifest/`, independent of harnesses.
- Callers supply paths; the helper does not discover harness installation or
  manifest locations.
- Recorded file paths are relative to a caller-supplied installation root.
- Loading a missing manifest returns `null`; loading an invalid manifest throws.
- Existing files without a recorded entry are untracked. Callers cannot assume
  they are safe to overwrite or remove.
- The manifest is a plain object with `version: 1` and a `files` array. Each entry
  has a relative `path`, a lowercase hexadecimal SHA-256 `checksum`, and `size`
  in bytes. The installation root is not persisted.
- `load(path)` returns `Promise<Manifest | null>`; `save(path, manifest)` accepts
  the same `Manifest` type and returns `Promise<void>`.
- `capture(root, paths)` builds a `Manifest` from explicitly listed files.
- `inspect(root, manifest)` reads file state without changing the recorded
  baseline and returns `Promise<Inspection[]>`. Each result has `path` and
  `status: 'unchanged' | 'modified' | 'missing'`.
- Size or checksum differences count as `modified`.
- Callers maintain entries after successful changes and preserve the old baseline
  for skipped files; capturing edited files would accept those edits as baseline.
- Track regular files only. `capture` rejects symlinks and other file types;
  inspection reports `modified` if a recorded file becomes a symlink, directory,
  or another non-regular file, without following the replacement symlink.
- Filesystem access errors and invalid paths throw, including paths escaping the
  supplied root. Only an absent inspected file produces `missing`; only an absent
  manifest produces `null`. Capturing an absent file throws.

## Assumptions

- Callers record only successfully installed files as the installed baseline.

## Risks and Caveats

- Inspection reports file state at inspection time; files can change before a
  caller subsequently updates or removes them.
- The helper does not discover untracked files or decide whether approval permits
  an action. Callers must handle existing destinations without recorded entries.
