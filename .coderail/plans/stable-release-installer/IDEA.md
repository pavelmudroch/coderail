---
title: "Stable release installer"
status: "archived"
---

Create `install.sh` to bootstrap the latest stable GitHub release for the host platform, excluding canary.

## Implementation status

Implemented in `install.sh` and the existing upgrade and publication modules.
The installer bootstraps or repairs Linux/macOS installations, reuses healthy
installations, and preserves active or owned bootstrap executables during cleanup.
Default stable selection uses GitHub’s latest designation. PATH setup, stable
listing, and guarded release promotion are implemented. The PowerShell installer
remains deferred. The investigation notes below describe the baseline used for
the design.

## Initial investigation (historical)

- `install.sh` currently only declares the repository URL.
- Existing installation and bootstrap contracts are recorded in [Upgrade command](../upgrade-command/IDEA.md): default root `~/.coderail`, custom roots supported, bootstrap executable under `<root>/libexec/`, then invoke its upgrade command by physical path. Runtime derives the root from that location.
- `src/commands/upgrade/distribution.ts` defines latest as the numerically highest stable X.Y.Z tag (optional v prefix), excluding drafts and prereleases, across all release pages. It does not use GitHub's latest designation.
- Releases currently publish platform ZIP archives and SHA-256 sidecars, not standalone binary assets. Extracting just `cr` for bootstrap is possible after archive verification.
- Upgrade supports first installation and same-version reconciliation, installing resources, manifest and launcher. It downloads the archive again.

## Agreed release selection

- Use GitHub's latest release designation for installer and default upgrade selection, with no moving Git tag. This supersedes the earlier highest-version default contract. The current upgrade implementation follows this selection rule.
- Publisher should create releases with `make_latest: "false"`, upload and validate the complete asset set, then promote the intended default with `make_latest: "true"`. Older maintenance releases should not displace the intended default. Canary remains a prerelease and cannot be latest.
- Resolve `/releases/latest` once and pin subsequent downloads and bootstrap upgrade to that release. Partial version selectors still select the highest matching stable version.

## Agreed bootstrap approach

- Detect OS/architecture; download the selected platform ZIP and checksum, verify before execution, extract the executable into a unique bootstrap location under the chosen root's libexec directory, then run its upgrade command pinned to the selected version.
- Reuse upgrade for distribution installation and activation; accept a second archive download initially rather than introduce a new local-package interface.
- Keep installer behavior in root `install.sh`.
- Support Linux and macOS on x64 and arm64. A Windows PowerShell installer is deferred.

## Agreed rerun and failure behavior

- With no existing installation, bootstrap normally.
- With a valid existing installation, invoke its `cr upgrade --version latest` rather than downloading a bootstrap executable; same-version reconciliation can restore missing managed resources.
- With a broken or incomplete installation, download a fresh bootstrap executable and invoke upgrade while preserving existing files and its normal conflict rules. A failed upgrade caused by conflicts or network errors does not by itself classify the executable as broken or justify a fallback retry.
- Preserve unrelated files. Conflicting files fail clearly; installer never supplies `--force` automatically.
- On failure, remove temporary downloads and installer-created unused bootstrap executables. Preserve installed files, active executables and user data; report partial changes through upgrade's existing diagnostics. No automatic rollback is introduced.
- A different `CODERAIL_INSTALL_ROOT` selects a separate installation; it does not relocate the old installation.

## Agreed installation root and PATH ownership

- Default root is `~/.coderail`; installer override uses `CODERAIL_INSTALL_ROOT` rather than a CLI argument. Upgrade continues deriving the root from its executable location; this installer override does not redirect existing installations.
- PATH setup belongs to `cr upgrade`, including initial installation through bootstrap. After successful activation, check whether the selected root's `bin` directory is on PATH. If absent, ask the user whether to configure PATH automatically.
- A PATH update failure is nonfatal: report the failure and provide concrete manual setup instructions. Successful distribution installation must remain successful.
- Only `<root>/bin` belongs on PATH. Persisting PATH cannot modify the invoking parent shell; report any reload/new-shell step required.
- Support PATH setup for Bash, Zsh, Fish and Windows user PATH; other shells receive manual instructions. Shell startup-file details are implementation choices following each shell's conventions.
- In noninteractive runs, skip prompting and editing shell configuration and print manual instructions. Declining the interactive prompt likewise skips edits and prints manual instructions.
- Piped installation (`curl ... | sh`) may still prompt via the terminal when one is available; truly unattended runs print instructions. Explicit noninteractive mode must remain respected.

## Agreed publication promotion

- After complete upload and validation, promote automatically only when the release version exceeds the currently designated latest, or no latest exists. Older maintenance releases remain available without promotion. Intentional rollback is a manual GitHub action. Serialize promotion decisions and recheck the latest designation to avoid older concurrent builds replacing newer ones.

## Implementation ownership

- Root `install.sh` owns platform detection, root selection, bootstrap downloads and installer cleanup.
- Existing upgrade command owns listing and PATH interaction after successful activation; release resolution remains in its existing distribution helper. Extend the existing stable publication helper and release workflow for promotion.
- No new public installation or local-package API is needed. Existing upgrade CLI is the installer boundary. Private helper extraction and shell startup-file handling are implementation freedom.

## Remaining decisions

- No unresolved product behavior. Exact private helper organization and diagnostic wording remain implementation choices.

## Verification expectations

- Cover stable/canary filtering, numeric version ordering, platform mapping, unsupported hosts, checksum and download failures, default/custom roots containing spaces, bootstrap activation and cleanup.
- Check reruns preserve existing installations and user templates; verify only root/bin is exposed on PATH.
- Verify PATH-present skips setup, PATH-absent prompts after activation, consent controls edits, repeated runs do not duplicate configuration, paths with spaces work, and update failures preserve upgrade success while printing manual instructions.
- Verify latest selection follows GitHub's designation even when a higher stable version exists, rejects invalid/prerelease publications, and fails clearly if no latest release exists. Verify publication promotes only after all uploads and validation succeed; upload or validation failures leave the previous latest unchanged.
- Exercise fresh, valid, broken and incomplete roots, conflicts, unrelated files, repeated runs, alternate roots and failure cleanup. Verify piped interactive prompts, unattended mode, supported shells and unsupported-shell guidance; test maintenance-release nonpromotion and concurrent publication ordering.
