---
title: Coderail installation, upgrade, and removal
status: ready
---

## Desired Outcome

Users can install, upgrade, and uninstall Coderail itself.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Owns Coderail's initial installation, upgrade workflow, and removal through `cr uninstall --self`.
* [Harness installation and removal](../harness-installation-and-removal/IDEA.md) owns user-level harness instructions and skills. Coordinate any harness cleanup or updates triggered by Coderail's own lifecycle with that idea.
* Project setup belongs to `init`; tickets, specifications, ideas, and helper files remain repository-level.

## Decisions

* Forge Coderail's own lifecycle separately from harness file management because they have distinct installation, update, and cleanup decisions.
* Initial installation uses a bootstrap script that downloads and extracts an archive from GitHub, then invokes that archive's `cr upgrade` in an internal installation mode.
* Normal `cr upgrade` downloads and extracts the target archive from GitHub, then invokes that archive's `cr upgrade` in the same internal installation mode. Each release supplies its own installation logic.
* Both the bootstrap script and normal `cr upgrade` set variables supplying the target version and installation destination and selecting the internal installation mode. This mode is not part of the public CLI interface; it installs already-extracted files without downloading again or recursively invoking the upgrade flow.
* The bootstrap script and `cr upgrade` default to the latest stable release and support selecting an explicit release tag.
* `cr upgrade --canary` installs the latest commit on `main`, primarily for development. Arbitrary branch names and commit hashes are outside the agreed version-selection scope.
* Initial installation defaults to `~/.coderail`. The bootstrap supports a custom destination through an environment variable, provisionally named `CODERAIL_HOME`; finalize the name during specification against existing configuration conventions.
* `cr upgrade` updates its own installation in place rather than relocating it to another destination.
* Coderail upgrades leave installed harness instructions and skills unchanged. Users update them explicitly through `cr install <harness>`; successful upgrade output reminds users to run that command.
* Self-removal preserves user configuration and unrecognized files. Apart from separately selected harness removal, it removes only Coderail-managed program files and installation metadata. Leave the installation directory in place when preserved files remain.
* Scripts are Coderail-owned files, not user customization points. Upgrades overwrite them without edit-confirmation prompts; self-removal does not require edit confirmation to delete them. Local script edits do not require `--force`.
* Edit protection applies to instruction files. Upgrades and self-removal fail before changing files when managed instruction files have local edits, unless `--force` is supplied. For deletion or overwriting of edited instruction files, `--force` permits asking for per-file approval; it does not itself approve either action. `--force --yes` approves those actions without prompting. Follow the harness confirmation rules, including failure when required interactive input is unavailable.
* Deliberately preserving edited instruction files counts as success during upgrade or self-removal if all other requested changes succeed. Report preserved files; their preservation must not block upgrading Coderail's scripts.
* Future templates may be bundled, user-created, or user-edited. Edited bundled templates follow the same edit protection and confirmation rules as instruction files; user-created templates are always preserved. Deliberately preserving customized templates must not cause an otherwise successful Coderail upgrade to fail. Template functionality remains future scope, coordinated with the project initialization and templates idea.
* Validate the entire requested upgrade and resolve all required prompts before changing installed files. Validation or prompt failure leaves the installation unchanged. After validation succeeds, stop on the first write failure without automatic rollback. Report completed and failed changes, deliberately preserved files, and changes not attempted.
* Installation state must let `doctor` identify the installed release or canary commit, missing or modified managed files, and incomplete installations, upgrades, or removals. Repair behavior and authority belong to the diagnosis-and-repair idea.
* Initial installation and upgrades refuse to overwrite unmanaged files at required destination paths, even with `--force` or `--yes`. Detect these conflicts before changing installed files and report the conflicting paths with guidance to move or rename them before retrying. Automatic script replacement applies only to files already managed by Coderail.
* Offer permanent PATH setup only when the installer can determine the user's shell and its appropriate startup file. Prompt for approval before editing that file; if detection is uncertain or the user declines, provide manual PATH setup instructions for the selected destination.
* When interactive input is unavailable, skip optional permanent PATH setup and print manual instructions without failing installation. `--yes` does not substitute for approval of shell startup file changes.
* Approved PATH setup uses a clearly marked Coderail block and avoids duplicate entries. Self-removal cleans up that managed block. New terminals pick up the persistent change; the current terminal still requires a reload or manual PATH update.
* Always validate the entire requested uninstallation before deleting anything, including Coderail removal and any selected harness removal. Check all selected files and resolve required confirmations and preservation choices first. Any validation or prompt failure leaves all files unchanged.
* If deletion fails after validation, stop on the first failure without automatic rollback. Report completed and failed removals, distinguishing deliberately preserved files and removals not attempted. A harness removal failure prevents Coderail removal.
* `cr uninstall --self` first checks whether any Coderail harness instructions are installed. `--with-harnesses` explicitly selects removal of all installed harness instructions; `--without-harnesses` explicitly preserves them. `--yes` does not select harness removal.
* If harness instructions are installed and neither harness-selection flag is supplied, ask whether to uninstall all of them using the Yes/No prompt. If interactive input is unavailable, fail with guidance to supply `--with-harnesses` or `--without-harnesses`.
* If the user declines harness removal, preserve the harness instructions and continue uninstalling Coderail itself.
* If the user agrees, attempt removal of all installed harness instructions before removing Coderail itself. Remove Coderail only after all requested harness uninstallations succeed; a harness removal failure prevents self-removal.
* Harness removal during self-removal uses the same checksum, `--force`, `--yes`, confirmation, and preservation rules as standalone harness uninstallation.
* Without `--force`, any edited instruction file, identified by a checksum mismatch, causes harness uninstallation to fail and prevents self-removal.
* With `--force`, the user may keep edited instruction files. Those deliberate preservation choices count as successful harness uninstallation and allow self-removal if all other requested removals succeed.
* With `--force`, confirm deletion of each edited instruction file using Yes/No, defaulting to No (keep). Accept `yes`, `no`, `y`, and `n`, case-insensitively. `--yes` automatically approves those deletions; it does not bypass the checksum failure without `--force`. Unchanged instruction files are removed automatically during approved harness removal.
* If edited files require confirmation with `--force`, but neither `--yes` nor interactive input is available, fail the uninstallation and preserve Coderail itself. Unavailable input must not be treated as a No answer or a successful preservation choice.

## Constraints

* Use a separate reusable prompt utility in `log.sh` for confirmation prompts. The prompt function itself must log an error and fail when interactive input is unavailable.
* Internal installation mode must work without an existing Coderail installation or configuration, distinguish the extracted source from the installation destination, and validate prerequisites before replacing an existing installation.

## Risks and Caveats

* Using the target archive's `cr upgrade` as the shared installer is the agreed design for now. Further caveats may emerge during implementation; revisit the design with the user if needed rather than treating it as irrevocable.
* A write failure can leave a partially upgraded installation, potentially making `cr` unusable. Recovery may require rerunning the bootstrap; automatic rollback is not provided.
