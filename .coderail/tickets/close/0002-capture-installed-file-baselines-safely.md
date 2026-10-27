---
title: Capture installed file baselines safely
status: closed
depends-on: 0001
reason: done
duplicate-of: 
---

# Capture installed file baselines safely

Allow callers to capture an ordered baseline from explicitly selected regular
files beneath a supplied root. Depends on ticket 0001 for manifest types and
canonical path validation.

## Tasks

1. [x] Add capture and containment tests
2. [x] Implement safe file capture and byte fingerprinting
3. [x] Run capture checks

## Task details

### 1. Add capture and containment tests

Scope: add `tests/install-manifest/capture.test.ts`, exercising the public facade
with real temporary directories and guaranteed cleanup. Align any internal
helper tests with their implementation paths.

Expected outcome:

- Cover known SHA-256 digests for empty, text, and binary files; verify raw-byte
  sizes, explicit selection, exclusion of unlisted files, order, and empty lists.
- Reject invalid and duplicate paths before any selected-file reads, including
  sibling-prefix escape attempts and every canonical-path rejection in the spec.
- Reject missing files, leaf symlinks (live or dangling), directories, other
  non-regular leaves, symlink ancestors, and non-directory ancestors.
- Cover missing or invalid roots even for empty lists, legitimate symlink aliases
  for the supplied root, and propagation of read and access failures.

Validation: tests verify capture does not alter installed files, follows no
descendant symlinks, and preserves underlying failures. Use reliable fixtures or
existing stubbing patterns for platform-sensitive filesystem errors.

### 2. Implement safe file capture and byte fingerprinting

Scope: add `capture(root, paths)` to the facade and implement it under
`src/install-manifest/`. Reuse ticket 0001's path validation; keep containment and
fingerprinting helpers internal and available for inspection.

Expected outcome:

- Validate the entire selection and reject duplicates before file reads.
- Canonicalize the existing directory root using `realPath`, permitting root
  aliases; enforce separator-aware containment without relying on the current
  `Path.isWithin` prefix check.
- Examine descendants with `lstat`; reject symlink ancestors without traversing
  them, reject non-directory ancestors, and read only regular leaves.
- Hash raw bytes with built-in SHA-256, encode lowercase hexadecimal, and derive
  each captured size and digest from the same byte content.
- Return version `1` and ordered entries, including a valid empty manifest.
  Do not use `Fs.exists`, timestamps, permissions, or location discovery.

Validation: capture and persistence tests pass; capture never changes files or
persists a baseline automatically. Checks provide observation-time containment;
race-free filesystem access is outside scope.

### 3. Run capture checks

Scope: run `cr test ./src/install-manifest.ts ./src/install-manifest` and
`cr test ./tests/install-manifest`; resolve failures within the helper scope.

Expected outcome: capture tests, shared helper checks, and persistence regression
tests pass using the existing test map.

Validation: explicit behavior tests execute alongside facade checks; no harness,
command, or unrelated path-helper changes are made.

## References

- [Specification](../../plans/install-manifest-helper/SPEC.md), especially Relative
  paths and containment, File state and caller responsibilities, and Testing decisions
- [Persistence prerequisite](0001-persist-and-validate-install-manifests.md)
- [Filesystem facade](../../../src/fs.ts)
- [Path facade](../../../src/path.ts)
- [Filesystem test conventions](../../../tests/fs/read.test.ts)
- [Test map](../../test_map)
