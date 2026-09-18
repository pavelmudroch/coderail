---
title: Harness installation and removal
status: ready
---

## Desired Outcome

Users can install, update, and remove Coderail instructions and skills for agent harnesses at user level.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Covers harness behavior of `install` and `uninstall` together because they manage the same files throughout their lifecycle.
* Retains v1's user-level installation scope. Project-local harness installation is out of scope; `init` handles project setup.
* Supported harnesses are Codex (`codex`), Claude (`claude`), Copilot (`copilot`), and Gemini (`gemini`).
* Each selected harness receives all bundled Coderail instructions and skills; subset selection is out of scope for now.
* Prepare each instruction and skill file for its target harness, including required filenames, skill invocation syntax (such as `/` or `$`), and any separate TOML or YAML configuration files required by that harness. The installed content must be usable by the selected harness.
* Tickets, specifications, ideas, and helper files remain repository-level.
* V1 README behavior is background for forging; details beyond the agreed scope need confirmation.
* [Coderail installation, upgrade, and removal](../coderail-installation-upgrade-and-removal/IDEA.md) owns installation and upgrade of Coderail itself, plus `cr uninstall --self`. Coordinate any effects on harness files across the two ideas.
* Installation state must support `doctor` detecting missing or modified managed files and incomplete installations or removals. Repair behavior and authority belong to [Diagnosis and repair](../diagnosis-and-repair/IDEA.md).

## Decisions

* `cr install` and standalone `cr uninstall` require one or more explicit harness names, such as `cr install codex claude`. Without a harness name, show usage and fail. No `--all` flag is provided for now. `cr uninstall --self` uses its separate harness-selection rules.
* Destinations follow the existing `codex_home`, `claude_home`, `copilot_home`, and `gemini_home` configuration and corresponding `CODEX_HOME`, `CLAUDE_HOME`, `COPILOT_HOME`, and `GEMINI_HOME` environment overrides. Retain existing configuration precedence and validation, with defaults `$HOME/.codex`, `$HOME/.claude`, `$HOME/.copilot`, and `$HOME/.gemini`, respectively.
* Rerunning `cr install` updates an existing harness installation while protecting locally edited files.
* Installation and updates must refuse to overwrite an existing destination file not managed by Coderail, even with `--force` or `--yes`. Report the conflicting path, explain that the file is unmanaged by Coderail, and provide actionable guidance to resolve the conflict before retrying, such as moving or renaming the existing file.
* Updates fail on edited files with non-matching checksums unless `--force` is supplied. With `--force`, ask whether to overwrite each edited file using Yes/No, defaulting to No (keep). `--yes` approves those overwrites only when `--force` is also supplied. Use the same accepted answers and reusable prompt utility as uninstallation; a required prompt fails when interactive input is unavailable.
* Deliberately keeping edited files during an update counts as success if all other requested changes succeed. Report the preserved files.
* Updates remove previously managed files no longer shipped by Coderail, using the same checksum, `--force`, `--yes`, and deletion-confirmation rules as uninstallation. Unchanged obsolete files are removed automatically; edited obsolete files remain protected and can be deliberately kept.
* Validate the entire requested update and resolve all required prompts before changing any files. Validation or prompt failure leaves all files unchanged. After validation succeeds, stop on the first write failure without automatic rollback and report completed and failed changes, deliberately preserved files, and changes not attempted.
* `uninstall --self --with-harnesses` selects removal of all installed Coderail harness instructions; `--without-harnesses` preserves them. When harness removal is selected, all requested harness uninstallations must succeed before Coderail itself is removed.
* If harness instructions are installed and neither harness-selection flag is supplied during self-removal, ask whether to uninstall all of them using the Yes/No prompt. If interactive input is unavailable, fail with guidance to supply `--with-harnesses` or `--without-harnesses`.
* Declining harness removal preserves the harness instructions and still uninstalls Coderail itself.
* Standalone harness uninstallation and harness removal during self-removal use the same checksum, `--force`, `--yes`, confirmation, and preservation rules.
* Always validate the entire requested uninstallation before deleting anything. Check all selected files and resolve required confirmations and preservation choices first. Any validation or prompt failure leaves all files unchanged. During self-removal, this validation covers both the selected harness removal and Coderail removal.
* If deletion fails after validation, stop on the first failure without automatic rollback. Report completed and failed removals, distinguishing deliberately preserved files and removals not attempted. A harness removal failure prevents Coderail removal.
* An edited instruction file with a non-matching checksum causes harness uninstallation to fail without `--force`.
* With `--force`, the user can keep edited instruction files. Deliberately kept files count as successful removal outcomes; other removal failures still prevent self-removal.
* With `--force`, ask whether to delete each edited instruction file using a Yes/No prompt. Yes deletes the file; No preserves it. Default to No. Remove unchanged instruction files automatically during an approved harness uninstallation.
* Update and uninstallation confirmation prompts accept `yes`, `no`, `y`, and `n`, case-insensitively.
* `--yes` automatically approves edited-file deletion when `--force` is also applied. `--yes` does not replace the requirement for `--force` when checksums mismatch and does not select harness removal during self-removal.
* If edited files require confirmation with `--force`, but neither `--yes` nor interactive input is available, fail the uninstallation. Unavailable input must not be treated as a No answer or a successful preservation choice; failure prevents self-removal.

## Constraints

* Implement confirmation prompts as a separate reusable utility in `log.sh`. The prompt function itself must log an error and fail when interactive input is unavailable.
* Factor shared installation and uninstallation behavior into reusable functions that `doctor` and other scripts can call. Reuse must preserve the agreed validation, file protection, confirmation, and failure-reporting rules.
* Harness-specific configuration files follow the same managed-file ownership and protection rules as instructions and skills. Verify exact per-harness filenames, syntax, and formats during specification.

## Risks and Caveats

* Validation cannot guarantee that subsequent filesystem operations succeed. Failures can leave partially completed changes; reports describe the outcome and no automatic rollback is provided.
* Deliberately preserving edited or obsolete files can leave a mix of bundled and customized content, even when the operation succeeds.
