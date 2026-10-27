## Problem Statement

`cr install` and `cr uninstall` parse arguments but do not install or remove harness instructions.
Users need consistent protection for existing files, explicit approval for protected actions, and
reliable ownership tracking across installation, reinstallation, and removal.

## Goal

Implement command execution and shared instruction operations using the approved connector contract
and `InstallManifest`, independently of native harness mappings.

## Solution Overview

Commands validate options and harness selections, construct selected connectors lazily, and invoke
shared operations once per harness. Install prepares all bundled content in memory; uninstall needs
only connector locations and the existing manifest. Operations preflight the complete harness,
resolve confirmations, apply changes, and persist the resulting ownership baseline.

Each selected harness runs independently. Commands report successes, skipped files, and failures,
then fail overall if any harness failed. Declining a protected action is successful.

## Requirements

1. Preserve command help handling, `--` argument separation, boolean-option value rejection, and
   `requiresInit = false`. Implement `--no`/`-n`; require `--force` for either confirmation mode and
   reject `--yes` with `--no`. Keep usage as `[--force [--yes | --no]]`.
2. Use the configured default harness when none is named. Missing defaults and unknown names are
   usage errors. Validate every selection before constructing any connector or changing files;
   deduplicate names while preserving first-selection order.
3. Preserve rejection of `uninstall --self` combined with explicit harnesses. Otherwise `--self`
   reports not implemented without resolving a default or changing files.
4. Discover and load every bundled global instruction, skill and its supporting files, and subagent.
   Finish all translations and output validation before changing a harness's installed files.
5. Preflight all desired destinations and tracked files, including obsolete files. Without force,
   any modified tracked file or existing untracked destination blocks the entire harness operation.
6. Force permits confirmation; it does not approve changes. Automatically approve with `--yes` or
   decline with `--no`. Otherwise prompt for each protected file. If prompts are required and
   interaction is unavailable, fail before any changes. Safe actions require no prompt.
7. Reject non-regular destination leaves, non-directory ancestors, and descendant symlinks during
   preflight, even with force. Replacement and removal operate on regular files only.
8. Preserve old manifest entries and baselines for declined overwrites. Declined untracked
   destinations remain untracked. Declined removals retain the file but drop its entry, transferring
   ownership to the user. Report each skipped file.
9. Reinstall removes tracked files absent from the prepared bundle. Unchanged obsolete files are
   removed automatically; modified ones follow the same force and confirmation policy as uninstall.
10. Missing tracked files never need approval. Reinstall recreates still-desired files and drops
    obsolete entries; uninstall drops absent entries. Uninstall never removes untracked files.
11. Remove newly empty directories only along ancestors of successfully removed tracked files,
    stopping before home. Keep the manifest present during cleanup; delete an empty manifest last.
    Never remove home or unrelated empty directories.
12. Unexpected errors stop that harness without rollback. Preserve completed work in its manifest
    where possible, report failures including persistence errors, and continue other selections.

## Implementation Decisions

### Boundaries and interfaces

Use an `InstructionOperations` interface/value facade in `src/instruction-operations.ts` with
implementations under `src/instruction-operations/`, following repository conventions:

- `install(connector, bundleRoot, options)` prepares and installs the desired files.
- `uninstall(connector, options)` removes tracked files without discovering or translating assets.
- Both return a promise of a per-harness result containing ordered file outcomes and an optional
  operation error. Outcomes distinguish installed, removed, skipped, and already-missing files.
  Operational failures retain completed outcomes in the result; cancellation propagates after
  best-effort manifest persistence.
- Options explicitly carry `force`, confirmation mode (`prompt`, `yes`, or `no`),
  `nonInteractive`, and the command's `AbortSignal`.

Operations own preparation, containment checks, manifests, planning, confirmation, mutation, and
cleanup. Commands own selection, connector lifetime, reporting through `Log`, and aggregate status.
Keep the confirmation I/O behind a small internal function so tests can supply answers without a
real terminal. Do not add an operation framework, connector base class, or rollback layer.

Consume `HarnessConnector` and `ConnectorFile` exactly as defined in
[the common connector specification](../common-harness-connector/SPEC.md). Native mappings, home
defaults, override variables, and transformations remain sibling responsibilities.

### Selection, lazy construction, and exit behavior

Expose supported names independently of instances through the existing harness facade. Resolve only
the selected connector inside that harness's attempt; a constructor or home-resolution failure must
not prevent another valid selection from running. Replace eager construction with lazy construction
while preserving existing facade access where needed. Usage rendering must enumerate names without
constructing connectors. Dispose each constructed connector using its existing `Disposable` contract.

Use `Cli.raiseUsageError` for argument and selection errors. After reporting all per-harness results,
throw a summary error if any failed; do not call `Deno.exit` inside commands or operations. Preserve
`main.ts` mappings: usage errors exit 2, ordinary failures exit 1, cancellation exits 3. Cancellation
stops further harness attempts rather than being treated as an ordinary harness failure.

Report the harness and affected path for failures and skips; report a successful no-op when nothing
is tracked. Exact messages and summary counts are not a public contract. Read noninteractive policy
from the command configuration; do not rely on `Log.nonInteractive` being initialized by `main.ts`.

### Bundle preparation

Resolve the bundle as `join(context.installRoot, 'assets', 'instructions')`, never relative to the
working directory. Runtime context already resolves source and compiled executable installations.
Missing or unreadable bundles fail installation; uninstall remains independent of bundle presence.

Load root `AGENTS.md`, each skill directory under `skills`, and each subagent under `agents`.
Pass root and agent files to their respective translation methods. Pass each skill's complete
recursive file tree, including `SKILL.md` and binary supporting files, using skill-relative canonical
paths. Reject unexpected source structures or symlinks explicitly rather than silently dropping
assets or traversing links. Empty category directories are valid; a skill without `SKILL.md` is not.

Sort discovery paths deterministically and preserve each translation's returned order. Prepare
separate caller-owned records and bytes for each harness, then aggregate all outputs. A discovery,
read, mapping, or translation error fails that harness before destination directory creation or
installed-file changes. No temporary content staging is needed.

### Paths and preflight

Apply the manifest's canonical relative-path rules to all output paths: slash-separated, nonempty,
and without absolute or drive-qualified paths, backslashes, NUL, empty components, `.` or `..`.
Reject invalid paths instead of normalizing them. Reject duplicate outputs, file/ancestor collisions,
and collisions with the manifest location. Apply reserved-manifest checks to loaded entries too.

Require absolute connector home and manifest paths and the contracted manifest location directly
under home. Use separator-aware containment, not the current prefix-based `Path.isWithin` helper.
An existing home may be a root alias resolved through `realPath`, consistent with `InstallManifest`;
below the resolved home, inspect ancestors and leaves with `lstat` and never traverse symlinks.
Permit absent ordinary home/destination directories on first install; create them only after
preflight and confirmation. A missing manifest during uninstall is a successful no-op and must not
create home. Avoid `InstallManifest.inspect` on a missing root; that helper requires an existing root.

Validate the manifest leaf as a regular file before loading; a directory or live/dangling symlink
fails. Malformed manifests fail closed through `InstallManifest.load`, including with force. Use
`InstallManifest.inspect` for tracked baseline comparison, with additional leaf-type checks because
the helper classifies non-regular leaves as modified rather than rejecting them.

Validate every desired and tracked path before mutation, including paths whose removals might be
declined. Existing untracked destinations are protected even if their bytes match the desired
content. Compare tracked files against the saved baseline, never against the new bundle.

The action policy is:

| File state | Desired on install | Obsolete on install or tracked on uninstall |
| --- | --- | --- |
| Missing | Write and track new baseline | Drop entry; no prompt |
| Tracked, unchanged regular file | Write and track new baseline | Remove and drop entry |
| Tracked, modified regular file | Block without force; otherwise confirm overwrite | Block without force; otherwise confirm removal |
| Untracked, existing regular file | Block without force; otherwise confirm overwrite | Leave untouched |
| Non-regular leaf or unsafe ancestor | Fail preflight | Fail preflight when tracked |

Plan desired writes in prepared order and obsolete/uninstall removals in existing manifest order.
Check for all blocking conflicts before asking for approval. Resolve all required answers before
mutation, so unavailable input or prompt errors cannot cause partial installation. An empty answer
or end of input declines; prompts default to no. Check configuration and input/output terminal
availability when prompt mode is required; explicit yes/no modes need no terminal.

### Mutation and manifest lifecycle

Maintain an in-memory copy of the validated baseline. For install, create required ordinary
directories, write approved/safe files using the existing staged `Fs.write` mechanism, and use
`InstallManifest.capture` on successfully written files to obtain new baselines. Never recapture
declined overwrites. Retain existing entry order when replacing records and append newly tracked
paths in prepared order. Unrelated files are never discovered for removal.

For removals, drop an entry after successful deletion, confirmation decline, or verified absence.
Only successful deletions seed directory cleanup. Remove empty ancestors deepest first, checking
directory type and containment again. Stop a branch at a nonempty directory; other cleanup errors
fail the harness. Do not recursively delete directories or treat access failures as absence.

Persist the resulting nonempty manifest with `InstallManifest.save`. Keep an existing manifest
until cleanup finishes, and remove it last if the resulting entry list is empty. Do not create an
empty manifest for a fresh install with no accepted files. Missing tracked files and ownership
transfers must be persisted even when no installed bytes changed.

On an error after changes begin, stop executing the plan and attempt to persist the in-memory state
of completed actions, including entry drops. Report both the original error and a persistence error
if necessary. A write followed by failed capture or failed manifest persistence can leave changed
files without a matching baseline; report this limitation rather than claiming rollback. Check
cancellation between actions and perform the same best-effort persistence before propagating it.

Containment and preflight are observation-time checks. Recheck relevant types before mutation;
race-free filesystem access, cross-process transactions, and rollback are not part of this scope.
Existing staged-write lock failures remain ordinary operation failures.

## Testing Decisions

Use `Deno.test`, `@std/expect`, temporary trees, and `try/finally` cleanup. Test shared operations
through the facade with minimal fake connectors and real manifest I/O. Use existing facade/`Log`
stubbing conventions with restoration in `finally`; keep interactive input and injected failures
deterministic. Replace current command placeholder and stale usage expectations in this scope.

Cover:

- Flag combinations, aliases, rejected values, help, `--`, defaults, deduplication, and validation of
  all names before construction or mutation. Cover `--self`, lazy help, and connector disposal.
- Runtime-root bundle resolution, all asset categories, recursive binary skill files, deterministic
  preparation, and preparation failures with no destination changes. Uninstall must not translate.
- Every action-policy row for install, reinstall, obsolete removal, and uninstall, including
  equal-size edits, untracked matching bytes, missing files/ancestors, and unchanged skipped baselines.
- Both confirmation modes, interactive answers, default declines, and unavailable/noninteractive
  terminals. A late conflict or prompt failure must leave every file and manifest unchanged.
- Malformed/unsupported manifests, non-regular leaves, symlink ancestors/leaves/manifests,
  root aliases, traversal, sibling-prefix escapes, duplicate and file/ancestor outputs, and manifest
  collisions. Force must not bypass structural validation.
- Ownership transfer, partial manifests, empty-manifest deletion, missing-manifest no-ops, and
  cleanup stopping before home or nonempty parents while preserving unrelated empty directories.
- Injected write, capture, deletion, cleanup, and save failures: stop that harness, retain completed
  outcomes, persist the remaining baseline where possible, and still attempt later selections.
  Cover cancellation separately and success/failure aggregation through existing main exit behavior.

After implementation, run checks for every changed source and test path, including:

```sh
cr test ./src/commands/install.ts ./src/commands/uninstall.ts
cr test ./src/harness.ts ./src/instruction-operations.ts ./src/instruction-operations
cr test ./tests/commands/install.test.ts ./tests/commands/uninstall.test.ts
cr test ./tests/instruction-operations
```

Also run the harness behavior tests added for lazy selection and any affected main tests. The current
test map lints/formats top-level facades only; nested source paths additionally run corresponding
tests and coverage, and explicit test paths add mutation testing. Keep new tests aligned with their
implementation paths and run explicit test paths so facade checks do not replace behavior tests.
No test-map change is required.

## Out of Scope

- Native connector mappings, transformations, defaults, environment override names, and discovery
  verification; these remain the Codex and Claude connector scopes.
- Implementing the common connector contract or changing the manifest schema/helper contract.
- Installing/upgrading/removing the coderail executable, distribution packaging, or `--self` support.
- Project-local installation, shared `~/.agents` destinations, section merging, content backups,
  temporary content staging, transactions, and rollback.
- Repairing unrelated unfinished harness helpers or the existing `Path.isWithin` implementation.

## Assumptions

- This approved leaf is one implementation scope; native sibling uncertainty does not block shared
  operation implementation or fake-connector tests.
- The common connector contract is an implementation dependency. Native end-to-end installation
  becomes available only when the selected native connector is implemented; placeholders fail clearly.
- Bundled content fits in memory and follows the existing root/skills/agents layout. Distribution
  places assets beneath the runtime installation root; packaging changes are separate work.
- Deterministic ordering, default-no interactive answers, and complete confirmation before mutation
  are safe implementation details of the approved protection policy.

## Further Notes

Policy originates in [the parent idea](../IDEA.md) and [this idea](IDEA.md); connector and manifest
contracts originate in the common connector specification and
[manifest specification](../../install-manifest-helper/SPEC.md).

Existing source changes in `src/commands/install.ts`, `src/commands/uninstall.ts`, and `src/path.ts`
are user-owned. Preserve them when implementing. The unwired incomplete helpers in
`src/harness/get.ts` and `src/harness/list.ts` need no repair for facade-based lazy selection.

This specification is ready for implementation. No material operations decisions remain open.

## Ticket Plan

1. [0005: Install prepared instructions with protected file ownership](../../../tickets/open/0005-install-prepared-instructions-with-protected-file-ownership.md) — depends on connector contract 0004 and completed manifest helper 0003.
2. [0006: Uninstall tracked instructions and transfer declined ownership](../../../tickets/open/0006-uninstall-tracked-instructions-and-transfer-declined-ownership.md) — depends on 0005; adds reusable tracked removal and cleanup.
3. [0007: Remove obsolete tracked instructions during reinstall](../../../tickets/open/0007-remove-obsolete-tracked-instructions-during-reinstall.md) — depends on 0006; completes combined install/reinstall planning.
4. [0008: Execute install and uninstall commands with lazy harness selection](../../../tickets/open/0008-execute-install-and-uninstall-commands-with-lazy-harness-selection.md) — depends on 0007; integrates both operations, reporting, and exit behavior.
