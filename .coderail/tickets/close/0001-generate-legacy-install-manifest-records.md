---
title: Generate legacy install manifest records
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Generate legacy install manifest records

Provide `install_manifest_record FILE RELATIVE_PATH` as a sourced POSIX shell function that generates an ownership record from intended source content, independently of the ownership path. This ticket delivers record generation; snapshot publication follows in ticket `0002`.

## Tasks

1. [x] Add record-generation contract tests
2. [x] Implement generic ownership-path validation and record generation
3. [x] Validate shell compatibility and test execution

## Task details

### 1. Add record-generation contract tests

Create executable `tests/utils/install_manifest.test.sh` using `set -eu`, isolated temporary fixtures, explicit sourcing, and `tests/suite.sh`, following `tests/utils/path.test.sh`. Assert stdout, status, and exact output bytes separately from optional stderr diagnostics.

Expected outcome:

- Cover known content and empty files, independent source and ownership paths, and generic paths outside existing CLI/harness layouts.
- Preserve literal spaces (including leading/trailing spaces), backslashes, shell metacharacters, and leading `-` in paths; generated records end in exactly one newline.
- Reject wrong arity, missing/unreadable/nonregular/symlink sources, and empty/absolute ownership paths, empty components, `.`/`..` components, trailing slashes, tabs, and newlines.
- Inject checksum failure and assert every failed call emits no stdout. Check caller variables, working directory, and traps remain unchanged.

Validation:

- Tests fail against missing or incorrect generation behavior and pass after task 2.
- Byte comparisons detect altered escaping, spacing, or newline termination.
- Run `chmod +x tests/utils/install_manifest.test.sh` after creation.

### 2. Implement generic ownership-path validation and record generation

Create executable `lib/utils/install_manifest.sh` with `install_manifest_record` and private ownership-path validation reusable by ticket `0002`. Require exactly two arguments, validate the literal ownership path, then capture successful `path_checksum` output before emitting `CHECKSUM BYTE_COUNT RELATIVE_PATH\n`.

Expected outcome:

- Reuse caller-sourced `lib/utils/path.sh`; readable regular source files are required and symlinks are rejected.
- Return zero with one legacy record; return nonzero with no stdout for argument, path, or checksum/read failures.
- Use a subshell function body to contain assignments made by the utility and its dependencies.
- Add no automatic sourcing, CLI behavior, public reader/update API, directory allowlist, or changes to existing helpers or lifecycle callers.

Validation:

- All task 1 tests pass, including paths containing literal special characters.
- Run `chmod +x lib/utils/install_manifest.sh` after creation.

### 3. Validate shell compatibility and test execution

Run the specification's validation commands for the new scripts without changing `.coderail/test_map`.

Expected outcome:

- Both new scripts remain POSIX shell and executable.
- Existing utility test mapping selects the new test automatically.

Validation:

- `sh -n lib/utils/install_manifest.sh tests/utils/install_manifest.test.sh`
- `./tests/utils/install_manifest.test.sh` must pass directly; the mapped command's `|| :` can hide failures.
- `./bin/cr test lib/utils/install_manifest.sh`

## References

- [Specification](../../plans/install-manifest-utility/SPEC.md): requirements 1–4, module boundary, public interfaces, and record contract.
- [Idea](../../plans/install-manifest-utility/IDEA.md)
- [Path utilities](../../../lib/utils/path.sh): `path_checksum`; do not use `path_manifest_relative`.
- [Path utility tests](../../../tests/utils/path.test.sh)
- [Test suite](../../../tests/suite.sh)
- [Publication ticket](0002-publish-complete-install-manifest-snapshots.md)
