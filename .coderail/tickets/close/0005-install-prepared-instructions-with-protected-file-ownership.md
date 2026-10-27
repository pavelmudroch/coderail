---
title: Install prepared instructions with protected file ownership
status: closed
depends-on: 0004, 0003
reason: done
duplicate-of: 
---

# Install prepared instructions with protected file ownership

Provide the shared install operation for desired instruction files, including complete
bundle preparation, safe preflight, confirmation, and ownership persistence. Depends on
0004 for the connector contract and 0003 for the completed manifest helper. Obsolete
tracked-file removal is completed by 0007 before command integration in 0008.

## Tasks

1. [x] Add install preparation, protection, and failure tests
2. [x] Expose the operations facade and prepare complete bundles
3. [x] Preflight desired and tracked paths and resolve confirmations
4. [x] Apply desired writes and persist completed ownership changes
5. [x] Run install operation checks

## Task details

### 1. Add install preparation, protection, and failure tests

Scope: add operation-aligned tests under `tests/instruction-operations/` through the
public facade, with minimal fake connectors, real manifest I/O, temporary trees,
`Deno.test`, `@std/expect`, and cleanup/restoration in `finally`.

Expected outcome:

- Cover root instructions, every skill's recursive files including binary content,
  subagents, empty categories, deterministic discovery, returned translation order,
  multiple outputs, and separate caller-owned records/bytes per harness.
- Cover unreadable/missing bundles, unexpected structures, source symlinks, missing
  `SKILL.md`, read/translation failures, and invalid output sets before directory
  creation or installed-file changes.
- Cover missing destinations/ancestors, unchanged and modified tracked files including
  equal-size edits, and untracked destinations even when desired bytes match.
- Cover force/yes/no/prompt behavior, empty answers and EOF, unavailable terminals,
  configuration noninteractive policy, late conflicts, and prompt failures. All
  blocking conflicts and answers must resolve before any mutation.
- Cover strict path rules, sibling-prefix escapes, root aliases, malformed or
  unsupported manifests, unsafe manifest leaves, descendant symlinks, non-regular
  leaves, non-directory ancestors, duplicate outputs, ancestor collisions, and
  reserved manifest collisions in outputs and loaded entries, including with force.
- Cover declined tracked overwrites preserving old baselines and order, declined
  untracked destinations staying untracked, partial writes/capture/save failures,
  completed outcomes, and cancellation with best-effort persistence.

Validation: tests assert bytes, manifests, outcomes, and absence of premature writes;
failures are deterministic and do not depend on a real terminal. Obsolete removal
assertions belong to 0007.

### 2. Expose the operations facade and prepare complete bundles

Scope: add `src/instruction-operations.ts` and focused implementations beneath
`src/instruction-operations/`, matching existing interface/value facade conventions.

Expected outcome:

- Expose `install(connector, bundleRoot, options)` and the shared options/result types
  from the specification. Options explicitly carry force, confirmation mode
  (`prompt`, `yes`, `no`), noninteractive policy, and `AbortSignal`.
- Results retain ordered installed, removed, skipped, and already-missing outcomes
  plus an optional operation error; operational failures retain completed outcomes.
  Cancellation propagates after best-effort persistence. The uninstall implementation
  is added by 0006; do not expose a fabricated successful placeholder.
- Discover/load the complete root `AGENTS.md`, skills, and agents in deterministic
  order; reject unexpected structures and symlinks. Skills include canonical
  skill-relative paths, `SKILL.md`, and all recursive supporting bytes.
- Invoke each category's approved translation with caller-owned input, preserve
  returned order, aggregate fully materialized outputs, and validate them before
  destination changes. No temporary content staging or native mappings.

Validation: preparation tests pass with fake connectors and failures leave the
installation tree untouched. Bundle location is supplied by the caller, never
inferred from the working directory.

### 3. Preflight desired and tracked paths and resolve confirmations

Scope: implement containment, manifest loading, planning, and a small internal
confirmation I/O function that tests can replace. Keep policy inside operations.

Expected outcome:

- Require absolute home/manifest paths and the manifest directly beneath home.
  Permit an existing home alias through `realPath`; below it use separator-aware
  containment and `lstat`, never the prefix-based `Path.isWithin` helper.
- Permit absent ordinary home/destination directories; inspect all desired and
  tracked paths, including obsolete entries. Reject unsafe ancestors/leaves and
  reserved paths before mutation. Validate the manifest leaf before loading and
  fail closed on malformed data, even with force.
- Use `InstallManifest.inspect` against saved baselines only when root exists,
  adding explicit regular-file checks. Avoid inspection of a missing root.
- Block the entire operation without force for modified tracked files or existing
  untracked desired destinations. Force enables confirmation only; yes approves,
  no declines, and safe actions require no prompt.
- Resolve all conflicts before prompts and all answers before writes. Required
  prompt mode checks configured policy and input/output terminal availability;
  empty input/EOF defaults to decline. Explicit yes/no modes need no terminal.

Validation: all structural and conflict failures leave every file and manifest
unchanged. Do not add a framework, connector base class, or change manifest schema.

### 4. Apply desired writes and persist completed ownership changes

Scope: implement desired writes, in-memory baseline updates, outcomes, and error/
cancellation persistence, leaving obsolete-file removal for 0007.

Expected outcome:

- Recheck relevant types before mutation. Create directories only after approvals;
  write in prepared order with staged `Fs.write`, then capture successful writes.
- Preserve existing entry order when replacing records and append new paths in
  prepared order. Never recapture declined overwrites; report every skipped path.
- Save nonempty manifests and avoid creating an empty manifest on fresh installs
  with no accepted files. Preserve existing obsolete entries until 0007 integrates
  their removal rather than silently abandoning ownership.
- Stop on unexpected errors, retain completed outcomes, and attempt to persist the
  completed baseline. Report both operation and persistence errors, including the
  limitation of changed bytes after failed capture/save; claim no rollback.
- Check cancellation between actions and persist completed work before propagating
  it. Treat staged-write lock failures as ordinary operation failures.

Validation: normal and injected-failure tests verify baseline ordering, skipped
baselines, partial progress, cancellation, and persistence error reporting.

### 5. Run install operation checks

Scope: run `cr test ./src/instruction-operations.ts ./src/instruction-operations`
and `cr test ./tests/instruction-operations`, including every added nested source
and explicit test path.

Expected outcome: applicable lint, format, behavior, coverage, and mutation checks
pass without changing the test map.

Validation: facade checks do not substitute for explicit behavior tests. Preserve
user-owned source changes and report unrelated failures without expanding scope.

## References

- [Operations specification](../../plans/installation-and-uninstallation-commands/install-and-uninstall-operations/SPEC.md)
- [Common connector specification](../../plans/installation-and-uninstallation-commands/common-harness-connector/SPEC.md)
- [Manifest specification](../../plans/install-manifest-helper/SPEC.md)
- [Connector prerequisite](0004-define-the-common-harness-connector-contract.md)
- Completed manifest prerequisite: `0003-inspect-installed-files-against-recorded-baselines`
- [Manifest facade](../../../src/install-manifest.ts)
- [Staged file writer](../../../src/fs/write.ts)
- [Test map](../../test_map)
