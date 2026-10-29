---
title: Select project files for verification
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Select project files for verification

Select explicit files and directories safely and deterministically for `cr verify`.
This ticket implements explicit selection; ticket 0002 adds Git selection to the same module.

## Tasks

1. [x] Cover explicit file selection and containment
2. [x] Implement explicit selection and recursive traversal

## Task details

### 1. Cover explicit file selection and containment

Scope: add `tests/commands/verify/select-files.test.ts` for explicit inputs.

Expected outcome:

- Cover files, recursive directories, hidden and ignored entries, duplicate inputs, lexical ordering, and `/`-separated project-relative results.
- Cover paths resolved from a subdirectory working directory, the project root as an input, missing/outside paths, and names beginning with `..` that remain inside the root.
- Cover symlinks, explicitly named descendants of symlinks, non-regular entries, and cancellation during traversal.

Validation: temporary filesystem fixtures prove all explicit paths are validated before selection returns, with no checks started on invalid input.

### 2. Implement explicit selection and recursive traversal

Scope: create `src/commands/verify/select-files.ts`. Establish the design's `selectFiles(root, cwd, paths, changed, signal): Promise<string[]>` contract; complete its `changed` branch in ticket 0002 before CLI integration.

Expected outcome:

- Resolve CLI paths from `cwd`; reject missing/outside-project inputs using relative-path containment without changing shared `Path.isWithin`.
- Use native absolute paths for filesystem operations and `lstat` for entries and components beneath the project root.
- Walk regular directories, include hidden/ignored files, ignore symlinks and other non-regular entries, and prevent traversal through explicitly named symlink ancestors.
- Return unique regular files as lexically sorted project-relative paths with `/` separators. Check the abort signal while traversing; propagate other filesystem errors.
- Keep supporting helpers private to this module; add no generic filesystem API or filesystem locking.

Validation: run `cr test ./src/commands/verify/select-files.ts` and `cr test ./tests/commands/verify/select-files.test.ts`.

## References

- [Design: file selection contract](../../plans/verify-command/DESIGN.md#file-selection-contract)
- [Verify decisions](../../plans/verify-command/IDEA.md)
- Follow-up: ticket 0002, Git selection
