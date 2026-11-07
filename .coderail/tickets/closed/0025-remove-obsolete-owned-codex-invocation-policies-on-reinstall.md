---
id: "0025"
slug: "remove-obsolete-owned-codex-invocation-policies-on-reinstall"
title: "Remove obsolete owned Codex invocation policies on reinstall"
status: "closed"
created_at: "2026-11-07T13:40:41.590Z"
updated_at: "2026-11-07T13:48:16.547Z"
dependencies:
  - "0024"
reason: "done"
---

# Remove obsolete owned Codex invocation policies on reinstall

When a present source skill stops declaring `disable-model-invocation`, reinstall
must remove its previously generated, manifest-owned `agents/openai.yaml` so the
old invocation policy stops applying. Support both global and local Codex installs
through the shared installer lifecycle while preserving ownership and safety checks.

## Tasks

1. [x] Add real-connector regression coverage for obsolete policy reconciliation
2. [x] Plan and validate obsolete policy removals before filesystem mutation
3. [x] Apply protected removals and persist accurate ownership after partial failure
4. [x] Run required per-file verification

## Task details

### 1. Add real-connector regression coverage for obsolete policy reconciliation

Scope: extend `tests/commands/install.test.ts` using the real Codex connector and
existing filesystem, manifest, confirmation, and failure-injection conventions.

Expected outcome:

- For both scopes, install a skill with an explicit true or false invocation flag,
  remove the flag from that same source skill, and reinstall. Assert the generated
  policy and its manifest entry disappear while the skill remains installed.
- Exercise modified owned policies without force, with `--force --yes`, with
  `--force --no`, and with accepted/rejected interactive confirmation. Preserve
  bytes and ownership whenever removal is declined or fails.
- Preserve unowned policy files, omitted skills, and no-source installations.
  An explicit flag still produces its intended policy under existing conflict rules.
- Exercise global/local isolation, unsafe destination or symlink rejection before
  writes/removals, and partial failure with correct surviving ownership entries.

Validation: assertions inspect exact file contents/existence and manifest entries;
the flag-removal cases expose the current stale-policy behavior before the fix.
Invalid later destinations must leave earlier planned removals and writes untouched.

### 2. Plan and validate obsolete policy removals before filesystem mutation

Scope: `src/commands/install.ts`, consulting source skill presence, Codex translation
outputs, and the existing manifest. Keep native path knowledge in
`src/harness/codex.ts` where needed; change connector contracts only if necessary
and justified by the implementation. Retain the version 1 whole-file manifest.

Expected outcome:

- Identify only manifest-owned generated policy paths for source skills included
  in this install whose invocation flag is now omitted. Do not treat all absent
  translated files as deletion candidates or prune omitted skills.
- Resolve global `skills/<name>/agents/openai.yaml` and local
  `.codex/skills/<name>/agents/openai.yaml` relative to their correct homes.
- Finish translation, path validation, destination inspection, and conflict/
  confirmation planning for writes and removals before mutating the filesystem.
- Preserve descendant-path, manifest-path, duplicate/parent conflict, and symlink
  protections; no-source installs remain no-ops.

Validation: task 1 cases prove candidate scope and preflight behavior. Unowned
files never become removal candidates, even with force enabled.

### 3. Apply protected removals and persist accurate ownership after partial failure

Scope: installation execution and manifest update in `src/commands/install.ts`;
reuse existing inspection and manifest utilities where practical.

Expected outcome:

- Remove unchanged owned obsolete policies automatically. Apply existing modified
  file force/confirmation protections to changed policies, using removal-specific
  confirmation text.
- Recheck destination safety before removal. Retire ownership only for paths
  successfully removed or confirmed already absent, retaining entries for declined
  or failed removals.
- Persist successful writes and removals even if a later filesystem operation
  fails, and surface execution/persistence failures under existing error conventions.
- Persist removal-only manifest changes as well as mixed write/removal changes.

Validation: task 1 regressions pass for both scopes, all confirmation outcomes,
unsafe destinations, and injected partial failures. Manifest contents describe
completed operations without dropping ownership of surviving files.

### 4. Run required per-file verification

Scope: every source or test file modified for this ticket.

Expected outcome: run `cr verify ./src/commands/install.ts` and
`cr verify ./tests/commands/install.test.ts`, plus the corresponding `cr verify`
command for every other modified source/test file. Fix failures and repeat until
all required checks pass, following `AGENTS.md`.

Validation: record successful commands and results in the implementation handoff.

## References

- [Agreed review changes](../../plans/codex-harness-connector/REVIEW.md)
- [Codex connector idea](../../plans/codex-harness-connector/IDEA.md)
- [0024 — Codex installation prerequisite](../closed/0024-implement-functional-codex-harness-installation.md)
- `src/commands/install.ts` — translation, preflight, writes, and manifest update
- `src/commands/uninstall.ts` — existing protected removal behavior
- `src/harness/codex.ts` and `src/harness/connector.ts` — native paths and translation contract
- `src/install-manifest/inspect.ts`, `validate.ts`, `capture.ts`, and `save.ts`
- `tests/commands/install.test.ts` — real Codex lifecycle and failure fixtures
- `AGENTS.md` — required verification for modified source/test files

## Implementation handoff

- Added an optional connector hook for obsolete skill file paths. Codex supplies
  only its native invocation policy path when that present skill no longer emits
  the policy; shared installation code filters candidates by manifest ownership.
- Preflight validates writes and removals before mutation. Modified policies use
  force/confirmation protections with removal-specific prompts. Execution rechecks
  destination safety and persists successful writes and removals after failures,
  retaining original ownership for declined or failed removals.
- Added real Codex regressions for both scopes: explicit true/false flag removal,
  all confirmation outcomes, source-supplied and unowned policies, omitted skills,
  absent sources, scope isolation, unsafe destinations, partial failures,
  removal-only ownership changes, and disappearance during removal. Both original
  flag-removal regressions failed against the pre-fix installer.

Per-file verification passed:

- `cr verify ./src/commands/install.ts`
- `cr verify ./src/harness/codex.ts`
- `cr verify ./src/harness/connector.ts`
- `cr verify ./tests/commands/install.test.ts`
- `cr verify ./tests/harness/codex.test.ts`

The installer suite passed 32 tests and the Codex connector suite passed 13 tests,
with 100% reported source line coverage. The configured mutation checks passed
but reported type-error mutations rather than killed mutations; those results
provide no mutation-kill evidence.

Final summary verification passed with exactly this implementation's five changed
source/test files, excluding the ticket and pre-existing changes:

`cr verify -s ./src/commands/install.ts ./src/harness/codex.ts ./src/harness/connector.ts ./tests/commands/install.test.ts ./tests/harness/codex.test.ts`
