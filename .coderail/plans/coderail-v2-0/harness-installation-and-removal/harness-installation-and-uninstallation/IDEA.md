---
title: Harness installation and uninstallation
status: ready
---

## Desired Outcome

Users can install prepared Coderail harness files and uninstall managed harness content with manifest-based ownership, protected local edits, and the same installation rules as Coderail's internal installer.

## Understanding

* Inherits all agreed command, ownership, preservation, confirmation, and failure rules from [Harness installation and removal](../IDEA.md). Those rules remain the baseline for this child.
* Owns `cr install <harness> ...` and `cr uninstall <harness> ...`, including rerunning installation to refresh content from the current bundle. Both require explicit harness names; no `--all` or separate harness upgrade command is introduced.
* Supports user-level Codex, Claude, Copilot, and Gemini destinations using existing configuration precedence and environment overrides. Project-local installation is outside scope.
* [Harness instruction and skill rendering](../harness-instruction-and-skill-rendering/IDEA.md) supplies prepared files and destination-relative paths. This child owns destination selection, validation, filesystem changes, manifests, checksums, conflict detection, preservation, confirmations, obsolete-file cleanup, and removal.
* The complete prepared payload includes global instructions, skills and their supporting files, agent definitions, and generated harness configuration. All of these receive the same ownership and edit protection.
* Rendering semantics and formats, release acquisition, Coderail self-removal orchestration, diagnosis/repair, and project initialization belong elsewhere.

## Decisions

* Render all requested harness payloads before mutating installed state. Validate the entire requested operation and resolve required confirmations across all selected harnesses before applying changes.
* Honor configured harness destinations even when different harnesses use the same directory or nested directories. Do not reject a configuration merely because destinations overlap; the user is responsible for choosing them. Existing path-safety, ownership, and collision rules still apply to actual file actions, including conflicts between prepared payloads in the same operation.
* Maintain a versioned, line-oriented manifest local to each harness installation and separate from Coderail's own manifest. Record canonical relative paths and baseline POSIX `cksum` checksums and byte lengths of the actual installed content, including generated configuration.
* Keep each harness's ownership metadata distinct when harnesses share a destination. Sharing a directory does not confer ownership of another harness's files. Exact manifest names and layout belong in specification.
* A valid manifest is the sole ownership authority. Do not adopt files by name or matching content, overwrite invalid metadata, or let force flags override unmanaged collisions. Preserve unrelated content.
* All managed harness content is protected. Installation preserves edited files by default and retains the prior baseline for still-shipped files. Unchanged files can be refreshed and missing managed files restored.
* Obsolete unchanged files are removed. Preserved edited obsolete files become user-owned when their manifest entries are released.
* Uninstallation uses the existing manifest independently of the renderer and current bundle. Remove unchanged files, treat absent managed files as already removed, and preserve edited files by default while releasing their ownership. Successful preservation does not fail uninstallation.
* If a selected harness has no installation manifest, uninstallation succeeds without changes and reports that no managed installation was found. Preserve all existing files and continue processing other selected harnesses. An existing malformed, unreadable, or unsupported manifest remains a validation failure for the entire requested operation.
* `--force` enables per-file overwrite or deletion confirmation, defaulting to preservation; `--force --yes` approves those actions. `--yes` alone does not authorize destructive changes to edited content. Reuse `log_confirm`; unavailable required input fails before changes.
* Publish manifest snapshots atomically as actions and ownership releases complete. Stop on the first application failure without rollback and accurately report completed, preserved, failed, and unattempted actions, including file changes whose manifest publication failed.
* Remove the harness installation manifest when uninstallation leaves no managed entries. Preserve unrelated metadata and directories containing user content.

## Constraints

* Follow [Internal installation and manifest protection](../../internal-installation-and-manifest-protection/IDEA.md) and its [specification](../../internal-installation-and-manifest-protection/SPEC.md) for the shared ownership and protected-content contract.
* Reuse `path_checksum`, `path_manifest_relative`, and `path_manifest_target` in `lib/utils/path.sh`. Extend their shared contract for validated harness paths while retaining the internal installer's existing allowed-root restrictions and failure behavior; do not duplicate checksum or path-validation logic.
* Validate deterministic unique manifest records, schema, numeric metadata, canonical relative paths, permitted harness paths, and real filesystem components. Reject traversal and unrepresentable paths; never follow destination links when applying managed-file actions.
* All scripts and helpers remain pure POSIX shell; new scripts must be executable.

## Assumptions

* Manifest placement, schema details, and the exact shared helper interface can be finalized in specification within the parent contract.
* Rendering supplies the complete intended file set for each selected harness; installation remains responsible for validating it before applying changes.

## Risks and Caveats

* Preserved obsolete or uninstalled files become unmanaged and can conflict with a later installation at the same path.
* Application failures may leave partial state; manifests and reports must reflect completed actions without silently adopting or repairing state on a later run.
* User-selected overlapping destinations can produce file collisions. Directory overlap itself is allowed, but an actual ownership or payload conflict still fails validation before changes.
* Older parent/self-removal documents describe failure on edited files without force. The approved harness preservation contract supersedes that behavior; self-removal orchestration reconciliation remains with its owning idea.
