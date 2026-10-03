## Problem Statement

CodeRail needs reusable manifest operations for later installer integration. Existing manifest implementations mix publication with CLI or harness policy and use versioned formats. Rebuilding ownership baselines from edited destination files would incorrectly classify those edits as installed content.

## Goal

Provide a sourced POSIX shell utility that generates legacy `cksum` records and publishes caller-supplied complete snapshots. Keep existing installers, manifest locations, and formats unchanged until later integration.

## Solution Overview

Add `lib/utils/install_manifest.sh` with two functions: generate one record from a source file and its relative ownership path, and create or replace a manifest from a complete snapshot file. The caller selects files, assembles records, and controls installation sequencing. The utility validates records and delegates publication to `fs_write`.

## Requirements

1. Expose sourced functions only; add no CLI command or standalone execution behavior. All implementation and test scripts must be POSIX shell and executable.
2. Generate exactly `CHECKSUM BYTE_COUNT RELATIVE_PATH\n`: decimal checksum and byte count separated by single ASCII spaces, followed by the literal relative path. Include no header, harness name, or file-kind field.
3. Compute checksum and length from the supplied source file, independently of its ownership path. Require a readable regular file and reject symlinks.
4. Validate ownership paths generically, without CLI directory allowlists or named harness layouts. Reject empty or absolute paths, empty components, `.` or `..` components, trailing slashes, tabs, and newlines. Preserve spaces, backslashes, and shell metacharacters literally.
5. Publish the supplied complete snapshot without reading managed payload files or recalculating their checksums. Preserve record order and bytes; omitted prior records disappear from the new manifest.
6. Accept an empty snapshot as an empty manifest. Reject malformed records, blank lines, duplicate ownership paths, unsafe paths, headers, and the current tab-separated formats before changing the destination.
7. Create an absent destination or replace an existing regular file through `fs_write`, which stages beside the destination and calls `fs_replace`. Reject destination symlinks, directories, and other existing nonregular nodes.
8. Return failure without replacing the destination when arguments, records, source reads, staging, or replacement fail. Publish no partial snapshot. Do not change existing CLI or harness lifecycle callers.

## Implementation Decisions

### Module and dependency boundary

- `lib/utils/install_manifest.sh` owns record generation, generic record/path validation, and complete snapshot publication. Keep private helpers private; add no public manifest reader or entry-update interface.
- Follow the utility convention of explicit caller sourcing. Record generation requires `lib/utils/path.sh`; publication requires `lib/utils/fs.sh` and the caller's `register_temp_resource` implementation and cleanup lifecycle. Do not add automatic dependency loading or modify `bin/cr`.
- Reuse `path_checksum` for source validation and checksum calculation. Do not use `path_manifest_relative`, whose allowlists encode existing installer policy, or change existing path helpers.
- Use subshell function bodies to contain variables assigned by this utility and its dependencies. Neither function changes caller shell variables, working directory, or traps.

### Public interfaces

| Function | Inputs | Success output | Result |
| --- | --- | --- | --- |
| `install_manifest_record FILE RELATIVE_PATH` | Exactly two arguments: source file and independent ownership path | One newline-terminated legacy record on stdout | `0` on success; nonzero on failure |
| `install_manifest_publish DESTINATION SNAPSHOT_FILE` | Exactly two arguments: manifest destination and complete records file | Nothing on stdout | `0` on success; nonzero on failure |

Both functions emit no data on stdout on failure. Diagnostic text, if supplied, belongs on stderr; callers must not depend on its wording. No finer exit-status protocol is required.

Validate the ownership path and capture the successful checksum result before emitting a record. This prevents failed generation from producing partial output.

Publication accepts a readable regular snapshot file and rejects symlinks. A file argument permits complete validation followed by `fs_write "$destination" < "$snapshot_file"`, without introducing another buffering or filesystem helper. The caller retains ownership of the snapshot file.

### Record contract

Each nonempty record has two nonempty decimal digit fields, each followed by exactly one ASCII space; everything after the second separator is the ownership path. Do not split paths on whitespace or interpret escapes. Leading or trailing spaces within the path are literal path characters. Numeric fields need only satisfy decimal syntax; publication does not verify the recorded content baseline.

Generated records always end in a newline. Publication also accepts a valid final record without a terminating newline and preserves it as supplied. Empty files are valid snapshots; empty record lines are not. Duplicate paths are compared literally, without normalization or filesystem lookup.

### Publication behavior

1. Check arity, the snapshot file, and a nonempty destination path without a trailing slash or newline. Newlines are incompatible with the existing line-based temporary-resource registry. Absolute and relative destination paths are supported; protect relative paths beginning with `-` when passing them to shared helpers, for example by prefixing `./`.
2. Validate the entire snapshot before invoking a filesystem mutation helper. An invalid snapshot must not create destination parents or change an existing manifest.
3. Reject an existing destination unless it is a regular file and not a symlink. In particular, prevent `fs_replace` from moving the staged file into a destination directory.
4. Pass the validated snapshot to `fs_write` and propagate failure. Reuse its temporary-resource registration and replacement behavior. Missing parent directories may be created by its existing staging behavior; introduce no separate directory-creation policy.

Do not merge with the previous manifest, sort records, regenerate baselines, or preserve omitted entries. The caller is responsible for destination ancestor safety, ownership authorization, and preventing concurrent changes to the snapshot or destination during publication. Atomic manifest replacement covers the manifest only; it provides no payload transaction, writer lock, or crash-durability guarantee.

## Testing Decisions

Add executable `tests/utils/install_manifest.test.sh`, following `tests/utils/path.test.sh` and `tests/suite.sh`: `set -eu`, isolated temporary fixtures, explicit sourcing, and observable output, content, and status assertions. Supply file-backed temporary-resource registration and cleanup compatible with subshell calls.

Cover:

- Exact records for known content and empty files, source paths independent of ownership paths, and literal spaces, backslashes, metacharacters, and leading `-` in paths.
- Wrong arity; missing, unreadable, directory, and symlink sources; every rejected ownership-path category; and checksum failure without stdout output.
- Creating and replacing manifests, replacing with an empty snapshot, preserving bytes/order and an unterminated final record, and omitting old records. Include absent destination parents and relative destination paths.
- Invalid snapshot sources, malformed numeric fields or separators, blank lines, duplicate paths, unsafe paths, current headers/tab-separated records, and invalid destination node types.
- Destination content unchanged after validation failure or an injected `fs_replace` failure; no manifest created on failure. Invalid input must not create missing destination parents. Assert payload files remain unchanged and publication accepts supplied checksums without reading their corresponding payload files.

Implementation validation commands:

```sh
sh -n lib/utils/install_manifest.sh tests/utils/install_manifest.test.sh
./tests/utils/install_manifest.test.sh
./bin/cr test lib/utils/install_manifest.sh
```

The existing `.coderail/test_map` rule automatically selects the corresponding utility test; no map change is needed. Its current command swallows test failures with `|| :`, so direct test execution is required to establish success. Specification Markdown has no matching rule.

## Out of Scope

- Integration with CLI install, upgrade, harness install, or uninstall; loading the utility in `bin/cr`.
- Migration, removal, or support of existing versioned manifests; changes to manifest locations.
- Automatic file discovery, per-entry operations, manifest-reading APIs, and ownership-policy metadata.
- Connector discovery, translation, protocol decisions, or packaging changes.
- Payload writes, stale-file removal, edit confirmation, installation sequencing, rollback, concurrency coordination, or repairs to shared filesystem helpers.

## Assumptions

- The ready idea is one independent implementation scope; unfinished connector ideas do not block this utility.
- Callers generate records from intended payload content and keep the assembled snapshot stable through publication.
- Callers provide existing filesystem temporary-resource registration and cleanup. Publication inherits shared filesystem behavior rather than implementing a separate lifecycle.
- A snapshot file is an acceptable representation of caller-supplied records. Accepting a final line without a newline avoids unnecessary rewriting while generated records retain raw `cksum` output conventions.

## Further Notes

The format decision comes from [IDEA.md](IDEA.md). Prior art in `v1.3.0:lib/utils/archive_apply.sh` generated raw `cksum` lines and extracted paths by removing only the two numeric fields, preserving path spaces. Reuse that data contract, not its separate publication helpers.

Current implementations in `lib/commands/upgrade/internal_install.sh` and `lib/commands/install/harness_lifecycle.sh` remain authoritative for their callers until a separate integration change. Later integration must preserve edited-file handling and recover from failures between payload changes and manifest publication.

## Ticket Plan

1. [0001 — Generate legacy install manifest records](../../tickets/open/0001-generate-legacy-install-manifest-records.md)
2. [0002 — Publish complete install manifest snapshots](../../tickets/open/0002-publish-complete-install-manifest-snapshots.md), depends on `0001`.
