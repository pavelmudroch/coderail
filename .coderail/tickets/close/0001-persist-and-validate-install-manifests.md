---
title: Persist and validate install manifests
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Persist and validate install manifests

Allow callers to save and load a strictly validated, ordered installation baseline
without persisting an installation root. Establish the shared manifest types and
validation used by capture and inspection.

## Tasks

1. [x] Add persistence and runtime validation tests
2. [x] Implement manifest types, validation, and persistence
3. [x] Run persistence checks

## Task details

### 1. Add persistence and runtime validation tests

Scope: add operation tests in `tests/install-manifest/load.test.ts` and
`tests/install-manifest/save.test.ts`, following existing filesystem tests with
`Deno.test`, `@std/expect`, temporary directories, and `try/finally` cleanup.

Expected outcome:

- Cover ordered round trips, empty manifests, absent manifests, malformed JSON,
  unsupported versions, and runtime-invalid inputs.
- Reject non-plain objects, missing or unknown properties, duplicate paths,
  invalid checksums, and negative, fractional, unsafe, or nonnumeric sizes.
- Reject empty, absolute, drive-qualified, backslash-containing, NUL-containing,
  empty-component, `.`-component, and `..`-component paths without normalization.
- Cover read failures, write and lock failures, staged-write cleanup, and missing
  parent directories using reliable fixtures or existing stubbing patterns.

Validation: tests distinguish an absent manifest (`null`) from schema, parsing,
and filesystem errors (throws), and verify saved entries contain only `path`,
`checksum`, and `size` beneath the documented versioned object.

### 2. Implement manifest types, validation, and persistence

Scope: establish `src/install-manifest.ts` using the matching interface/value
facade convention and exported specification types. Implement `load` and `save`
under `src/install-manifest/`, keeping validation and canonical relative-path
rules internal. Add the remaining facade operations in their dependent tickets;
do not introduce placeholder methods or a configurable class.

Expected outcome:

- Accept only version `1`, exact documented properties, unique canonical paths,
  lowercase 64-character hexadecimal SHA-256 values, and nonnegative safe-integer
  sizes. Preserve entry order and allow empty manifests.
- Reuse `Fs.read` and staged `Fs.write`; catch `Deno.errors.NotFound` only around
  manifest reading. Validate before saving; do not create parent directories.
- Preserve underlying filesystem failures and existing lock cleanup conventions.

Validation: persistence tests pass through the facade where practical; no root,
discovery logic, caller policy, or changes to installed files are introduced.

### 3. Run persistence checks

Scope: run `cr test ./src/install-manifest.ts ./src/install-manifest` and
`cr test ./tests/install-manifest`; fix failures within this ticket's scope.

Expected outcome: facade lint/format checks and explicit operation tests pass,
with nested implementation/test filenames aligned to `.coderail/test_map`.

Validation: behavior tests run explicitly; facade-only checks do not substitute
for tests. No test-map change is needed.

## References

- [Specification](../../plans/install-manifest-helper/SPEC.md), especially Public
  contract, Manifest validation and persistence, and Relative paths and containment
- [Idea](../../plans/install-manifest-helper/IDEA.md)
- [Filesystem facade](../../../src/fs.ts)
- [Staged writes](../../../src/fs/write.ts)
- [Read tests](../../../tests/fs/read.test.ts)
- [Write tests](../../../tests/fs/write.test.ts)
- [Test map](../../test_map)
