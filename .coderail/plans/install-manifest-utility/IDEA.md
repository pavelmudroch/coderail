---
title: Install manifest utility
status: ready
---

## Desired Outcome

Provide sourced POSIX shell functions for generating legacy install-manifest lines and publishing a complete manifest snapshot, creating or replacing the destination.

## Understanding

- The request follows examination of v1.3.0, where manifests contained raw `cksum` lines: checksum, byte count, and relative path.
- Current CLI manifests use a `coderail-install-manifest` version-1 header and tab-separated file records containing kind, relative path, checksum, and byte count.
- Current harness manifests use a `coderail-harness-manifest` version-1 header with the harness name and tab-separated relative-path, checksum, and byte-count records.
- Manifest reading, publication, and record updates currently live separately in `lib/commands/upgrade/internal_install.sh` and `lib/commands/install/harness_lifecycle.sh`. `lib/utils/path.sh` already supplies checksum and path-validation functions.
- Manifest checksums establish the installed-content baseline used to detect edits. Refreshing a baseline from edited destination files would change what the installation considers unmodified.
- The intended installation flow generates records for the complete intended payload, applies installation changes and stale-file removals, then publishes the new complete manifest. This idea supplies manifest operations only; the eventual installer owns sequencing and failure recovery.
- The existing public connector ideas depend on manifest ownership. This utility is a separate idea; connector discovery and translation remain in those existing ideas.

## Constraints

- All scripts must be pure POSIX shell and follow existing repository conventions.
- Keep scope to the separate utility. Existing CLI and harness lifecycle callers remain unchanged.

## Decisions

- Use only the v1.3.0 manifest format to preserve compatibility: one raw `cksum` line per managed file, containing decimal checksum, decimal byte count, and relative path separated by spaces. No header or file-kind field.
- The utility will not support the current versioned, tab-separated manifest formats. The user intends to drop those formats.
- Create the utility for later integration only. Caller changes, migration of existing manifests, and changes to manifest locations are outside this idea.
- Expose sourced POSIX shell functions; standalone executable commands are outside scope.
- Create and update manifests through complete snapshot publication. Per-entry add, replace, and remove operations are unnecessary and outside scope.
- Reuse `lib/utils/fs.sh` for temporary resources and atomic replacement rather than introducing separate filesystem helpers. Its `fs_write` stages content beside the target and calls `fs_replace`.

## Boundary

- Generate one legacy-format record from a file path with a relative ownership path.
- Publish caller-supplied records as one complete snapshot, creating or replacing the manifest through the shared filesystem utility.
- The caller selects managed files and assembles all records. Automatic directory enumeration is outside scope.
- Exact function names, arguments, dependency loading, validation details, and test cases belong to specification.

## Risks and Caveats

- Reusing the legacy record format does not by itself establish compatibility of manifest locations or installer behavior. Those concerns belong to later integration.
- The legacy format carries neither the harness name nor CLI file-kind metadata. Any required installation-policy distinctions must be supplied outside these records.
- Atomic manifest replacement does not make payload writes and stale-file removals transactional. Later integration must handle failures that occur after payload changes but before manifest publication.
