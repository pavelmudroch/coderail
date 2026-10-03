---
title: Publish complete install manifest snapshots
status: closed
depends-on: 0001
reason: done
duplicate-of: 
---

# Publish complete install manifest snapshots

Provide `install_manifest_publish DESTINATION SNAPSHOT_FILE` to validate and publish a caller-supplied complete legacy manifest through `fs_write`. Depend on ticket `0001` for the utility module, generic ownership-path validation, and test script.

## Tasks

1. [x] Add snapshot-publication success tests
2. [x] Add validation and publication-failure tests
3. [x] Implement complete snapshot validation
4. [x] Implement publication through shared filesystem helpers

## Task details

### 1. Add snapshot-publication success tests

Extend `tests/utils/install_manifest.test.sh` with explicit `lib/utils/fs.sh` sourcing and file-backed temporary-resource registration and cleanup that works across subshell calls.

Expected outcome:

- Cover creation, replacement, empty snapshots, omitted prior entries, preserved record order/bytes, and a valid final record without a newline.
- Cover absent destination parents and absolute/relative destinations, including relative paths beginning with `-`.
- Accept decimal-syntax checksum/length fields without verifying payload content; preserve literal ownership-path spacing, backslashes, and metacharacters.
- Demonstrate publication succeeds without corresponding payload files and leaves existing payload files unchanged.
- Assert success emits no stdout, preserves the caller-owned snapshot, and leaves caller variables, working directory, and traps unchanged.

Validation:

- Compare manifest and snapshot bytes directly, including empty and unterminated snapshots.
- Tests fail against missing or incorrect publication behavior and pass after tasks 3–4.
- Registered staging resources are cleaned up by the caller's test lifecycle.

### 2. Add validation and publication-failure tests

Extend the same test script with invalid-input fixtures and controlled failures in source reading, staging, and replacement.

Expected outcome:

- Reject wrong arity, missing/unreadable/nonregular/symlink snapshot sources, and empty destinations or destinations ending in a slash or containing a newline.
- Reject malformed/empty numeric fields, incorrect separators, empty ownership paths, blank lines, literal duplicate paths, every unsafe ownership-path category, current headers, and tab-separated formats.
- Reject destination symlinks (including dangling links), directories, and other existing nonregular nodes.
- Assert failure emits no stdout, preserves an existing manifest, creates no manifest when absent, and never publishes a partial snapshot.
- Invalid input creates no missing destination parents and invokes no filesystem mutation helper. Inject `fs_replace` failure and assert the previous manifest remains intact.

Validation:

- Each rejected fixture returns nonzero without relying on diagnostic wording.
- Check destination bytes or absence, parent-directory absence for validation failures, and unchanged payloads.
- Inject source-read/staging failures as well as replacement failure to exercise propagation.

### 3. Implement complete snapshot validation

Add private record/snapshot validation in `lib/utils/install_manifest.sh`. Require a readable regular snapshot file that is not a symlink. Validate the entire file before any filesystem mutation, reusing ticket `0001`'s generic ownership-path validator.

Expected outcome:

- Parse two nonempty decimal digit fields, each followed by exactly one ASCII space; retain everything after the second separator as the literal path.
- Compare duplicate paths literally, without normalization, filesystem lookup, whitespace splitting, or escape interpretation.
- Accept empty snapshots and valid unterminated final records; reject malformed records, blank lines, unsafe paths, headers, and tab-separated formats.
- Read no managed payload files and recalculate no checksums; add no public reader or entry-update interface.

Validation:

- Task 2 validation tests pass before filesystem publication is attempted.
- Valid snapshots retain their original bytes rather than being reconstructed, sorted, or merged.

### 4. Implement publication through shared filesystem helpers

Add `install_manifest_publish` with a subshell body and exactly two arguments. Validate a nonempty destination without a trailing slash or newline, validate the snapshot, reject any existing destination that is not a regular nonsymlink file, then invoke `fs_write "$destination" < "$snapshot_file"`. Protect relative destinations beginning with `-` when passed to shared helpers, for example with `./`.

Expected outcome:

- Create or replace the complete manifest with no stdout; propagate argument, validation, source-read, staging, and replacement failures without partial publication.
- Use caller-sourced `fs.sh`, caller-provided `register_temp_resource`, and caller cleanup. Inherit staging, parent creation, and replacement behavior without adding filesystem helpers or directory policy.
- Replace rather than merge prior records; preserve order and bytes and remove omitted entries.
- Keep caller shell state isolated. Keep `bin/cr`, existing installers, helpers, manifest locations/formats, and `.coderail/test_map` unchanged.
- Retain the specification's caller responsibility for ancestor safety, ownership authorization, and stable inputs; add no payload transaction, writer lock, or crash-durability behavior.

Validation:

- All task 1–2 tests pass, including injected failures and directory-destination rejection.
- `sh -n lib/utils/install_manifest.sh tests/utils/install_manifest.test.sh`
- `./tests/utils/install_manifest.test.sh` must pass directly because the mapped test command swallows failures.
- `./bin/cr test lib/utils/install_manifest.sh`
- Both scripts retain executable permissions.

## References

- [Specification](../../plans/install-manifest-utility/SPEC.md): requirements 5–8, record contract, publication behavior, testing decisions, and scope boundaries.
- [Idea](../../plans/install-manifest-utility/IDEA.md)
- [Record-generation dependency](0001-generate-legacy-install-manifest-records.md)
- [Filesystem utilities](../../../lib/utils/fs.sh): `fs_write`, staging registration, and `fs_replace`.
- [Path utility test conventions](../../../tests/utils/path.test.sh)
- [Test suite](../../../tests/suite.sh)
- [Existing test mapping](../../test_map)
