## Problem Statement

`cr install` and `cr uninstall` currently show help but cannot manage harness files. Users need to install the prepared Coderail instructions, skills, agents, and configuration into their chosen harness homes, refresh them after a Coderail upgrade, and remove only content Coderail actually owns. Existing personal files and edits must survive unless the user explicitly approves changing them.

## Goal

Implement user-level `cr install <harness> ...` and `cr uninstall <harness> ...` for Codex, Claude, Copilot, and Gemini. Use local, versioned ownership manifests and the internal installer's checksum, path-safety, preflight, confirmation, and partial-failure rules. Make repeated installation and uninstallation predictable, including when destinations overlap.

## Solution Overview

Installation asks the sibling [renderer](../harness-instruction-and-skill-rendering/SPEC.md) for a complete staged tree for each selected harness. It then inventories those trees, reads the selected installations' manifests, plans all file and ownership changes, and resolves every required confirmation before changing any harness home. Uninstallation needs only the selected manifests; it works even if the current Coderail bundle or renderer cannot produce the old files.

A private lifecycle module shared by the install and uninstall commands owns destination validation, manifest parsing, planning, application, and reporting. Each harness has its own manifest below its configured home. All installed payload files, including generated configuration, use the protected-file policy established in the [parent idea](../IDEA.md). This specification covers the ready [installation and uninstallation idea](IDEA.md), one leaf of that split parent.

## Requirements

1. Accept one or more explicit names from `codex`, `claude`, `copilot`, and `gemini` for both commands. With no name, an unknown name or option, or a conflicting option, show usage and exit with a usage error. Support `-h`/`--help`, `-f`/`--force`, and `-y`/`--yes`; allow `--` before names. Repeated names are processed once in first-appearance order. Do not add `--all` or an upgrade alias. Keep `cr uninstall --self` reserved for its owning program-removal scope rather than interpreting it as a harness.
2. Resolve each selected home using the existing `codex_home`, `claude_home`, `copilot_home`, and `gemini_home` configuration precedence and `CODEX_HOME`, `CLAUDE_HOME`, `COPILOT_HOME`, and `GEMINI_HOME` overrides. Retain current configuration validation and defaults of `$HOME/.codex`, `$HOME/.claude`, `$HOME/.copilot`, and `$HOME/.gemini`. Additionally validate the resolved action root and its existing ancestry before accessing or changing managed paths: reject links, non-directories, ambiguous paths, tabs/newlines, and unsafe components. A missing default home may be created safely during installation application; configured and environment-overridden homes still must exist under the current loader's rules. Do not create any home during preflight or uninstallation.
3. For installation, render every selected harness into a distinct temporary tree outside all selected homes before installed-state preflight. A renderer failure, invalid staged tree, invalid destination, invalid manifest, collision, or unavailable required confirmation fails the entire request without changes to any selected home. Rendering supplies ordinary files with destination-relative paths, including generated configuration; installation validates its output independently.
4. For uninstallation, do not call the renderer or require current bundle content. If a selected manifest is absent, report that no managed installation was found for that harness, preserve its home, and continue. An existing malformed, unreadable, unsupported, linked, or wrong-type manifest fails preflight for the entire request.
5. Store a distinct manifest for each harness at `<home>/.coderail/harnesses/<harness>.manifest`. Its schema version 1 is newline-terminated, tab-delimited text:

   ```text
   coderail-harness-manifest<TAB>1<TAB><harness>
   file<TAB><relative-path><TAB><cksum><TAB><byte-length>
   ```

   Records are sorted by relative path in `LC_ALL=C` order and unique. The header's harness must match the selected harness. Checksums and lengths are unsigned decimal values from POSIX `cksum` of the installed bytes. Reject empty lines, comments, extra or missing fields, invalid numbers, missing final newline, unsupported versions, unsafe or noncanonical paths, and records outside that harness's permitted payload paths. The manifest and its containing directories are metadata, never payload records.
6. A valid selected manifest is the only authority to replace or remove an existing destination file. Never adopt an unlisted file based on its name, location, or matching bytes. An existing file, link, directory, or special entry needed by an incoming payload and absent from that harness's manifest is an unmanaged collision, even with `--force --yes`. Report all discoverable collisions and tell the user to move or rename them before retrying. Preserve unrelated files and metadata.
7. Before mutation, validate every selected payload, prior record, target, parent component, and metadata location. Allow equal or nested configured home directories, but reject actual conflicts between selected operations: two harnesses claiming or writing the same absolute file, a file/parent-path conflict, or a payload/manifest-path conflict. A directory overlap alone is valid. Recheck source bytes and relevant target, parent, manifest, and ownership preconditions immediately before each action; never traverse a destination link.
8. On rerun, create missing managed files and refresh unedited managed files when staged bytes differ; leave files unchanged when their bytes already match the staged content. Preserve source executable status on creation or replacement. A current managed regular file is edited when its POSIX checksum or byte length differs from its recorded baseline, even if its bytes equal the newly staged file. File mode alone does not change the recorded content baseline. Preserve an edited file by default and retain its old manifest record while the path remains shipped. `--yes` alone does not change this policy.
9. With `--force`, ask separately through `log_confirm` before replacing each edited managed file. Yes replaces it; No or an empty answer preserves it. `--force --yes` approves these per-file replacements without prompting. An unreadable or non-regular managed target must never be followed or silently overwritten; a link is treated as edited and requires the same approval before replacing the link itself. A directory or other non-file target that cannot be safely replaced as one leaf is a preflight conflict, not permission for recursive deletion.
10. Remove an unchanged previously managed file no longer present in the staged payload. Treat an absent obsolete file as already removed. Preserve an edited obsolete file by default; with `--force`, ask separately before deletion, and let `--force --yes` approve it. A preserved obsolete file is omitted from the next manifest and becomes user-owned, so a later reinstall at that path sees an unmanaged collision.
11. Uninstallation removes only unchanged files recorded by that harness's valid manifest; absent recorded files count as already removed. Preserve edited recorded files by default or on a declined `--force` confirmation, and release their ownership. `--yes` alone does not authorize deletion of edits. All successfully preserved files are reported and do not make the operation fail. Remove a selected harness's manifest when its last owned entry is released or removed; leave unrelated metadata and directories containing user content intact.
12. Resolve all required prompts for all selected harnesses before the first mutation. Use the existing `log_confirm` Yes/No/default behavior. When `--force` requires a prompt but input is unavailable and `--yes` is absent, fail the whole preflight with guidance to retry interactively or with `--force --yes`; do not treat unavailable input as No.
13. Apply the prepared actions in deterministic harness and path order, using same-directory temporary files and rename for file creation/replacement. Record the checksum and byte length of actual installed bytes. Publish each changed manifest snapshot atomically after a completed file action or ownership release; unlink an empty uninstall manifest only after its final release. Stop at the first application or manifest-publication failure without rollback. Report completed, unchanged, already absent, preserved, failed, and unattempted paths, including when a file changed but its new baseline could not be published. A later run must not silently repair or adopt that partial state.
14. Extend the shared `path_checksum`, `path_manifest_relative`, and `path_manifest_target` contract in `lib/utils/path.sh`; do not duplicate their checksum or manifest-path logic. Keep the existing internal installer's one-argument relative-path and two-argument target calls, allowed `bin/`, `lib/`, `instructions/`, `templates/` roots, and failure behavior intact. All implementation remains pure POSIX shell, and new scripts are executable.

## Implementation Decisions

### Command and lifecycle boundaries

`lib/commands/install.sh` and `lib/commands/uninstall.sh` own public option parsing and reporting. They source a private harness lifecycle module under `lib/commands/install/` that exposes preparation and application functions for both operations. Keep separate `prepare install`, `prepare uninstall`, and `apply prepared` entry points so later self-removal orchestration can combine its own preflight with harness removal without invoking the public command. The prepared plan is private temporary state, not an ownership record or public API. The installer calls the renderer's private `harness_render <harness> <bundle-root> <empty-stage-root>` interface from its sibling spec; no renderer is needed for removal.

`bin/cr` already sources shared logging, configuration, path, and filesystem utilities, checks supported harness names, and dispatches to command modules. Retain that command structure. The internal Coderail program installer remains separate and continues to use only its own manifest. No global harness registry, lock format, or persistent journal is added in this scope.

### Manifest and path contract

The selected harness's own home holds its `.coderail/harnesses/<harness>.manifest`, so homes that coincide can hold four independent manifest names. Each record grants authority only to its header's harness and one canonical relative file path. Empty version-1 manifests may be read, but successful uninstallation removes the manifest once no entries remain. Manifest creation and update must refuse existing nonmanifest content at the reserved metadata path; invalid metadata is never overwritten.

Extend `path_manifest_relative <path> [scope]` and `path_manifest_target <absolute-root> <relative-path> [scope]` with an optional scope. Omitted scope is the existing Coderail payload validator. `harness:<name>` validates a path for that harness. Both helpers reject unknown scopes and preserve their existing output/status contract. The target helper still performs lexical joining and never follows links; the caller checks real components. `path_checksum` remains unchanged and is used for both staged and installed regular files.

The harness scope permits its one global instruction filename, `skills/<valid-skill-name>/<file...>` including supporting files, and its top-level `agents/<name>.<harness-suffix>` files. The names and suffixes follow the rendering spec: Codex `AGENTS.md` and `.toml`; Claude `CLAUDE.md` and `.md`; Copilot `copilot-instructions.md` and `.agent.md`; Gemini `GEMINI.md` and `.md`. Skill names use the renderer's ASCII letter/digit/underscore/hyphen convention. All paths reject absolute names, empty or `.`/`..` components, traversal, repeated/trailing slashes, tabs, and newlines. The entire `.coderail/` metadata tree is excluded from staged payloads and manifest records. This limits what a corrupted manifest could authorize without making the installer parse harness content.

Manifest parsing validates the header, field count, order, uniqueness, numbers, permitted paths, and final newline before using any record. Use quoted path handling and avoid `eval` or whitespace splitting on untrusted records. Stage inventory is deterministic and rejects links, special files, unsafe directories, duplicate destinations, and unreadable files. Configuration overlap is checked by comparing absolute target paths produced from normalized selected homes, not by rejecting homes merely because their directories overlap.

### Planning and state transitions

For each path in the union of staged inventory and the selected manifest, classify the action as create, refresh, unchanged, remove, already absent, preserve, or conflict. A selected manifest authorizes only its own old records; it does not authorize a newly added path that happens to exist. Compare installed bytes with the old baseline before considering incoming bytes. Treat a managed link as an edited leaf that can be unlinked/replaced only after the applicable force decision; never read through it. Reject unsafe parent components and non-leaf target types instead of deleting a tree.

Preflight includes every selected harness before any installed-state mutation. Confirmations are captured as decisions in the prepared plan, with No retaining or releasing ownership according to whether the file is still shipped. During application, recheck the assumptions for each action and stop if a target changes, a parent becomes unsafe, or a manifest no longer matches its observed state. Avoid a silent overwrite when two concurrently changed paths invalidate the plan. File changes use a temporary file in the same parent directory and rename; directory creation uses real components only. An unsuccessful manifest publication after a file change leaves the old manifest intact and is reported as an incomplete action, not repaired by inferred ownership.

For still-shipped preserved edits, retain the old checksum and length. For a completed create or refresh, publish the checksum and length of the new destination file. For a completed obsolete removal, already-absent transition, or preserved obsolete file, drop that old record. During uninstall every completed removal, already-absent transition, or deliberate preservation drops the record. Remove only empty directories created during this operation when safe; directories are not manifest-owned and no whole-home cleanup occurs.

### Compatibility and errors

There is no migration or content-based adoption of files installed before this manifest. A missing selected manifest means fresh-install rules for `install` and a successful no-op for `uninstall`. An existing invalid selected manifest fails the whole request, including when another selected harness could otherwise succeed. Installation and uninstallation return success when all eligible actions finish and any edits are deliberately preserved. Usage errors use the CLI's existing usage status; validation or application failures use its normal error status.

The parent idea's preservation rules supersede older self-removal text that required failure on an edited harness file. This spec does not alter self-removal orchestration. A future caller can invoke prepared harness removal, but the program-removal owner must decide how to coordinate its separate state and failure sequence.

## Testing Decisions

Add focused executable POSIX-shell tests at `tests/commands/install.test.sh`, `tests/commands/uninstall.test.sh`, and `tests/commands/install/harness_lifecycle.test.sh`, plus `tests/utils/path.test.sh` coverage for the new optional harness scope. Follow `tests/suite.sh` and disposable fixture homes and bundles. Integrate with the renderer through staged fixture payloads and a caller-level renderer failure case; ordinary tests must not write to real user homes or require installed harness CLIs.

Cover command parsing and configuration precedence; default, custom, equal, and nested homes; distinct manifests in a shared home; duplicate selected names; all four path layouts; generated configuration ownership; and renderer failure in the last selected harness. Assert that every preflight or prompt failure leaves all selected files and manifests byte-identical. Cover malformed/wrong-harness/versioned manifests, unsafe paths and metadata parents, unreadable metadata, unmanaged byte-identical files, links, wrong types, and collisions between selected payloads or manifest claims.

Exercise first install, idempotent refresh, changed incoming bytes, missing managed files, and edits that happen to match incoming bytes. For current and obsolete edits, test no force, `--yes` alone, force with Yes/No/default, force plus yes, and unavailable input. Check actual file bytes and modes, prior or new baselines, ownership release, successful preservation, subsequent unmanaged collision, and uninstall without a manifest or renderer. Inject file-copy, rename, removal, and manifest-publication failures after at least one successful action; verify first-failure stopping, snapshot contents, and truthful completed/failed/unattempted reports.

Run `sh -n` on changed shell scripts, run the focused tests directly with `sh`, and run `./bin/cr test <changed-lib-paths>` for applicable test-map coverage. `.coderail/test_map` currently appends `|| :`, so direct test execution supplies the pass/fail signal. Do not run the full `tests/all.sh` suite unless implementation changes behavior outside these focused components.

## Out of Scope

* Harness-specific rendering semantics or formats, bundle acquisition, Coderail program installation/upgrade, and `cr uninstall --self` orchestration.
* Project-local installation, subset selection within a harness, a separate harness upgrade command, and `--all`.
* Automatic adoption or migration of pre-manifest files, rollback, diagnosis/repair, and runtime enforcement of skill invocation policy.

## Assumptions

* The active Coderail installation supplies the renderer and bundle. It provides a complete staged file set for each requested harness or fails before installation changes a home.
* POSIX `cksum` and ordinary same-directory rename semantics are available. Checksums detect accidental local content edits; they are not an authentication boundary.
* The existing configuration loader remains the source of configured home precedence; lifecycle preflight adds stricter filesystem safety checks for selected homes without changing that precedence.
* Distinct configured homes can later be repointed at the same directory. Only currently configured and selected installations are discoverable in this scope; no historical-home registry is inferred.

## Further Notes

The current `install.sh` and `uninstall.sh` are help-only stubs. `lib/commands/upgrade/internal_install.sh` is useful prior art for strict manifest parsing, preflight, same-directory file replacement, atomic manifest snapshots, and partial-failure reports, but its program-file replacement and v1 migration policies do not apply to protected harness files. The sibling renderer's prepared-tree contract determines destination-relative paths; this installer remains responsible for independently validating them before they confer ownership.

## Ticket Plan

The implementation is split into five tickets:

1. [Extend harness path and manifest contracts](../../../../tickets/open/0004-extend-harness-path-and-manifest-contracts.md) adds shared path scopes and strict ownership metadata.
2. [Install new harness payloads safely](../../../../tickets/open/0005-install-new-harness-payloads-safely.md) depends on ticket 0004 and the [renderer contract](../harness-instruction-and-skill-rendering/SPEC.md) from ticket 0003.
3. [Reconcile protected harness installations](../../../../tickets/open/0006-reconcile-protected-harness-installations.md) depends on ticket 0005 and adds refresh, obsolete-file, and edit decisions.
4. [Uninstall managed harness payloads](../../../../tickets/open/0007-uninstall-managed-harness-payloads.md) depends on tickets 0004 and 0006 and adds manifest-only removal.
5. [Coordinate multi-harness lifecycle preflight and application](../../../../tickets/open/0008-coordinate-multi-harness-lifecycle-preflight-and-application.md) depends on tickets 0005–0007 and completes cross-harness atomic preflight and partial-failure reporting.
