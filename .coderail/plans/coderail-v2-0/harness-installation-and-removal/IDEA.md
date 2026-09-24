---
title: Harness installation and removal
status: split
---

## Desired Outcome

Users can install and uninstall Coderail instructions and skills for agent harnesses at user level, using the same manifest-based ownership and protected-file rules as Coderail's internal installer.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* This split parent retains the agreed scope and shared lifecycle rules. Its children separately own harness content rendering and installation/uninstallation; each receives its own specification.
* Owns only `cr install <harness> ...` and `cr uninstall <harness> ...`, including rerunning installation to refresh the selected harness files from the currently installed Coderail bundle. There is no separate harness upgrade command or release-download workflow.
* Retains v1's user-level installation scope. Project-local harness installation is out of scope; `init` handles project setup.
* Supported harnesses are Codex (`codex`), Claude (`claude`), Copilot (`copilot`), and Gemini (`gemini`).
* Each selected harness receives all bundled Coderail instructions and skills; subset selection is out of scope for now.
* Prepare each instruction and skill file for its target harness, including required filenames, skill invocation syntax (such as `/` or `$`), and any separate TOML or YAML configuration files required by that harness. The installed content must be usable by the selected harness.
* Tickets, specifications, ideas, and helper files remain repository-level.
* [Coderail installation, upgrade, and removal](../coderail-installation-upgrade-and-removal/IDEA.md) owns installation and upgrade of Coderail itself, `cr uninstall --self`, and selection and orchestration of harness removal during self-removal. Those workflows are outside this idea. Coderail upgrades leave installed harness files unchanged; users refresh them explicitly with `cr install <harness>`.
* [Internal installation and manifest protection](../internal-installation-and-manifest-protection/IDEA.md) and its [specification](../internal-installation-and-manifest-protection/SPEC.md) define the current installation ownership, checksum, preservation, and failure rules to reuse. Its protected-content rules take precedence over the older sibling idea's install-time checksum-mismatch failure rule. Every managed harness instruction, skill, and harness-specific configuration file is protected content; the automatic replacement exception for Coderail program files does not apply.
* Diagnosis, repair, release acquisition, PATH setup, project initialization, and Coderail self-removal are out of scope. The manifest records managed-file state for later consumers without defining their workflows or adding repair authority here.

## Decisions

* Rendering produces a prepared set of files with destination-relative paths for each selected harness. Installation validates and applies that set, recording checksums of the installed bytes. Rendering for all selected harnesses must succeed before installation changes any installed files or manifests.
* Rendering owns harness-specific content, filenames, layout, skill references, invocation policies, front matter, and accompanying configuration. Installation owns destination resolution, ownership, manifest validation, file protection, and filesystem changes. Uninstallation uses the installed manifest independently of rendering and the current bundle.
* Keep all four harness renderers in one child because they share source conventions and translation requirements. No separate public rendering command is required by this decomposition.
* `cr install` and harness `cr uninstall` require one or more explicit harness names, such as `cr install codex claude`. Without a harness name, show usage and fail. No `--all` flag is provided for now.
* Destinations follow the existing `codex_home`, `claude_home`, `copilot_home`, and `gemini_home` configuration and corresponding `CODEX_HOME`, `CLAUDE_HOME`, `COPILOT_HOME`, and `GEMINI_HOME` environment overrides. Retain existing configuration precedence and validation, with defaults `$HOME/.codex`, `$HOME/.claude`, `$HOME/.copilot`, and `$HOME/.gemini`, respectively.
* Persist a versioned, line-oriented manifest local to each harness installation, separate from Coderail's own installation manifest. Record every managed destination file by canonical relative path with its baseline POSIX `cksum` checksum and byte length. Record the bytes actually installed after harness-specific transformation, not the original bundle bytes. Manifest metadata is not a managed payload entry.
* A valid manifest is the sole authority for ownership. Missing, malformed, unreadable, or unsupported manifests do not authorize adoption, replacement, or deletion of existing files. Do not infer ownership from filenames or matching content. Existing invalid metadata must not be silently replaced.
* Installation refuses every required destination collision with an unmanaged file, link, or wrong-type path, even with `--force` or `--yes`. Report conflicting paths and guidance to move or rename them before retrying. Unrelated non-conflicting content may coexist in the harness directory. Automatic migration or adoption of pre-manifest harness installations is outside scope.
* Rerunning `cr install` creates missing managed files, refreshes unchanged managed files, and reconciles obsolete managed files against the current bundle. Detect local edits against the recorded baseline, even when the edited bytes happen to match the incoming content.
* Without `--force`, preserve edited managed files during installation and continue all eligible actions. With `--force`, ask separately before overwriting each edited file; Yes replaces it and No/default preserves it. `--force --yes` approves those actions automatically. `--yes` alone does not authorize overwriting edited content.
* A preserved still-shipped file retains its previous manifest baseline so later installations continue to detect the edit. A successfully created or replaced file receives the checksum and byte length of its newly installed content.
* Installation removes unchanged previously managed files no longer shipped. Preserve edited obsolete files by default; with `--force`, ask separately before deletion, and let `--force --yes` approve it. A preserved obsolete file is removed from the manifest and becomes user-owned. A later installation must treat that path as unmanaged if the bundle reintroduces it.
* Uninstallation acts only on files authorized by the selected harness manifest. Remove unchanged files automatically and treat already absent managed files as already removed. Preserve unrelated files and directories containing preserved content; never remove an entire harness home as a cleanup shortcut.
* Without `--force`, uninstallation preserves edited managed files, releases their manifest ownership, and continues removing eligible files. `--yes` alone has the same preservation behavior. Preserved files become user-owned and do not cause the uninstallation to fail.
* With `--force`, ask separately before deleting each edited managed file. Yes deletes it; No/default preserves it. `--force --yes` approves those deletions. Deliberately preserved files become user-owned when uninstallation releases their manifest entries. Once no managed entries remain, remove the harness installation manifest without removing unrelated metadata.
* Deliberate preservation counts as success when all other requested actions succeed. Report every preserved file and any release of ownership.
* Reuse `log_confirm` in `lib/utils/log.sh` for overwrite and deletion confirmations. Accept `yes`, `no`, `y`, and `n`, case-insensitively, with No as the default. If a required confirmation cannot be read and `--yes` is absent, fail before changes; unavailable input is not a preservation choice.
* Validate the entire requested operation across all selected harnesses and resolve all required prompts before changing installed files or manifests. Validation or prompt failure leaves all selected installations unchanged. Recheck relevant path and ownership preconditions before applying each action.
* Publish manifest snapshots atomically as file actions and ownership releases complete, following the internal installer's rules. Stop at the first file or manifest write/deletion failure without rollback. Report completed, preserved, failed, and unattempted actions, explicitly distinguishing a completed file change from failure to publish its new manifest baseline. Do not silently repair or adopt partial state on a subsequent run.

## Constraints

* All scripts and helpers must remain pure POSIX shell; new scripts must be executable.
* Reuse `path_checksum`, `path_manifest_relative`, and `path_manifest_target` from `lib/utils/path.sh` for checksum and manifest-path handling. Do not implement harness-specific copies of their validation or checksum logic.
* The existing manifest-path helpers allow only Coderail payload roots (`bin/`, `lib/`, `instructions/`, and `templates/`). Extend the shared utility contract to support validated harness destinations while retaining the internal installer's existing root restrictions and failure behavior. The exact helper interface belongs in specification.
* Apply the same strict manifest rules: deterministic unique records, supported schema, numeric checksums and lengths, canonical relative paths, and rejection of traversal, absolute paths, and tab/newline-bearing paths. Validate harness-specific permitted paths rather than treating a manifest as permission to manage arbitrary files in the harness home. Never follow destination links or unsafe parent components when applying managed-file actions.
* Share installation and uninstallation planning and file-protection behavior where appropriate. Future callers may reuse those functions, but implementing `doctor` or self-removal orchestration is outside this idea.
* Harness-specific configuration files follow the same managed-file ownership and protection rules as instructions and skills. The rendering child resolves source semantics and unsupported harness capabilities during forging; exact per-harness filenames, syntax, and formats must be verified during its specification.

## Assumptions

* POSIX `cksum` is available. Its checksum and byte length detect accidental local edits; they do not authenticate releases or establish a security boundary.
* Harness-specific manifest placement and schema details can be finalized during specification, provided ownership stays local to the selected installation and independent of Coderail's own installation manifest.

## Risks and Caveats

* Validation cannot guarantee that subsequent filesystem operations succeed. Failures can leave partially completed changes; reports describe the outcome and no automatic rollback is provided.
* Deliberately preserving edited or obsolete files can leave a mix of bundled and customized content, even when the operation succeeds.
* Pre-manifest files remain unmanaged and can block installation until the user moves them. Released customized files can similarly block a later reinstall at the same path.
* The parent and older self-removal idea still describe harness checksum mismatches failing without `--force`. This revised harness contract supersedes that behavior for harness operations. Reconciling self-removal orchestration with successful preservation belongs to its owning idea, outside this change.

## Decomposition

Confirmed split: rendering has independent decisions about expressing instruction and invocation behavior across harnesses, while installation and uninstallation manage file ownership and preservation. These concerns require separate specifications with a shared prepared-file interface. Do not create a specification for this parent.

* [Harness instruction and skill rendering](harness-instruction-and-skill-rendering/IDEA.md) — produce usable harness-specific files from bundled sources; own source semantics, invocation-policy translation, filenames, layout, and generated configuration. Does not modify installed harness files or ownership manifests.
* [Harness installation and uninstallation](harness-installation-and-uninstallation/IDEA.md) — install the prepared files and uninstall manifest-managed content; own destinations, manifests, checksums, confirmations, preservation, cleanup, and failure handling. Does not translate instruction or invocation semantics.

Both children start in `forging`. Rendering defines the prepared content consumed by installation; uninstallation requires only installed ownership state.
