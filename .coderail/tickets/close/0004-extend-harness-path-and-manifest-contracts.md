---
title: Extend harness path and manifest contracts
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Extend harness path and manifest contracts

Provide the shared path scope and strict ownership-manifest handling needed by both harness commands, while preserving the internal program installer's existing path behavior.

## Tasks

1. [x] Add harness path and manifest fixture tests
2. [x] Extend shared path validation with harness scopes
3. [x] Implement strict private harness manifest parsing and snapshot writing

## Task details

### 1. Add harness path and manifest fixture tests

Add `tests/utils/path.test.sh` coverage for the optional `harness:<name>` scope and focused POSIX-shell manifest tests in `tests/commands/install/harness_lifecycle.test.sh` using temporary homes.

Expected outcome:

- Tests cover each harness's global filename, skill subtree and agent suffix, rejection of metadata paths and unsafe components, unknown scopes, and compatibility of the old one-argument relative and two-argument target calls.
- Tests reject wrong harness or version, missing final newline, invalid fields or numbers, unsorted or duplicate records, unsafe paths, linked or wrong-type manifests, and existing nonmanifest metadata.

Validation:

- Run both focused tests directly with `sh`; verify existing internal-installer path tests still pass.

### 2. Extend shared path validation with harness scopes

Extend `path_manifest_relative <path> [scope]` and `path_manifest_target <absolute-root> <relative-path> [scope]` in `lib/utils/path.sh`. Keep omitted scope behavior and `path_checksum` unchanged. Validate canonical relative paths under only the selected harness's global file, `skills/<valid-name>/<file...>`, or `agents/<name>.<suffix>`; reject `.coderail/`, traversal, repeated separators, tabs, newlines, and unknown scopes.

Expected outcome:

- The existing internal program installer retains its accepted roots and return/output contract.

Validation:

- Run `sh -n lib/utils/path.sh` and focused old and new path tests.

### 3. Implement strict private harness manifest parsing and snapshot writing

Add private helpers under `lib/commands/install/` for `<home>/.coderail/harnesses/<harness>.manifest`. Parse version-1, newline-terminated tab records without `eval` or whitespace splitting; enforce header identity, sorted unique safe paths, unsigned decimal `cksum` and byte length, and safe regular metadata. Write sorted snapshots through same-directory temporary files and rename; never overwrite invalid metadata or claim payload paths from a different harness.

Expected outcome:

- A manifest is the sole authority for later replacement or removal; empty valid manifests can be read and an absent manifest is distinguishable from an invalid one.

Validation:

- Run the direct manifest fixtures and `./bin/cr test <changed-lib-paths>`; use direct tests for pass/fail because the test map masks failures.

## References

- [Installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- [Rendering specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- `lib/utils/path.sh`, `lib/commands/upgrade/internal_install.sh`
