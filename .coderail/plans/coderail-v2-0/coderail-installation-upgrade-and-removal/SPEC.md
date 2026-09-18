## Problem Statement

The current `INSTALL` file exposes the intended bootstrap interface but has no implementation. Coderail also has no v2 mechanism to update or remove its own files safely. Users need a POSIX-shell installation path that does not depend on an existing Coderail checkout and that preserves their configuration and customized instructions.

## Goal

Implement standalone bootstrap installation through `INSTALL`, in-place `cr upgrade`, and `cr uninstall --self`. Each operation must identify Coderail-owned files, protect user-owned and edited instruction files, and leave useful state after an interrupted operation.

## Solution Overview

`INSTALL` remains a self-contained public bootstrap script. It resolves a supported GitHub target, downloads and extracts its archive in a temporary directory, validates the extracted release, and invokes that release's `cr upgrade` in a private installation mode.

The target release owns file installation. A shared program-lifecycle utility plans and applies installation, upgrade, and removal from an explicit inventory and durable ownership record. `cr upgrade` uses the same acquisition and private-install path for the installation that contains the running command. `cr uninstall --self` composes program removal with the reusable harness-removal contract from [the sibling specification](../harness-installation-and-removal/SPEC.md).

This specification covers the ready [program lifecycle idea](IDEA.md), one leaf of the split [Coderail v2.0 idea](../IDEA.md).

## Requirements

1. Implement `INSTALL` as a standalone, executable, POSIX-shell script. It accepts no positional arguments. `-h` and `--help` print its usage; unknown arguments fail with exit status `2`.
2. Preserve the declared bootstrap interface:

   ```text
   sh INSTALL
   CODERAIL_INSTALL_DIR=<destination>
   CODERAIL_INSTALL_VERSION=latest|main|X.Y.Z|vX.Y.Z
   ```

   The default destination is `$HOME/.coderail`; the default version is `latest`. Explicit empty variables are usage errors. Normalize numeric versions to `vX.Y.Z`. Do not add public selectors for branches, commits, URLs, or relocation during upgrade.
3. `latest` selects the repository's stable release pointer, an explicit version selects that release tag, and `main` selects the canary. Resolve the selected ref to a concrete commit before acquisition. For `latest` and explicit versions, download the release archive already created on GitHub for the resolved tag; the installer does not create it. For `main`, download GitHub's on-demand archive for the resolved latest `main` commit. A default install must not silently fall back to `main` when the stable release cannot be resolved.
4. Use `https://github.com/pavelmudroch/coderail` as the bootstrap origin. Require `curl` or `wget`, `tar`, `mktemp`, and the POSIX utilities used for validation; report missing prerequisites and download/extraction failures clearly.
5. Download and extract only in a private temporary directory. Validate that the archive extracts to exactly one ordinary source root and contains the required target contract before execution. Reject malformed archives, links or unsafe paths that could escape extraction, and incomplete targets. Always remove temporary resources on normal exit and signals.
6. Bootstrap and public upgrade invoke the extracted target's private installation mode. That mode receives distinct canonical source and destination roots, the resolved channel/version/commit, and whether the caller is bootstrap or upgrade. It installs already extracted content and never downloads or re-enters public upgrade. Internal variables are not a public interface.
7. `cr upgrade [--version <tag>|--canary] [--force] [--yes]` upgrades the installation containing the invoked `cr`; it never reads `CODERAIL_INSTALL_DIR` to relocate itself. `--version` accepts the same release-tag forms as bootstrap. The options are mutually exclusive, and unknown/missing/conflicting values are usage errors.
8. Install only the declared program payload: `bin/`, `lib/`, `instructions/`, `INSTALL`, the installation contract marker, and shipped root documentation needed by the installed program. Do not copy a repository checkout wholesale. Preserve executable modes for installed commands.
9. Never overwrite an unmanaged required destination, even if its bytes match or `--force --yes` is supplied. Detect every conflict before modification and tell the user to move or rename the path. Preserve configuration, repository data, templates, and unrecognized files.
10. Track all managed files with their relative path, kind, checksum, byte length, and installed release identity. Program scripts and root assets are replaceable Coderail files. Bundled files below `instructions/` are protected customization points.
11. Replace or delete an edited managed instruction only with `--force`. With `--force`, ask separately before each overwrite or deletion; a No/default answer preserves that file and is a successful outcome. `--force --yes` approves these individual actions. Unavailable required input is an error, not a preservation decision. Reuse the sibling lifecycle's `log_confirm` behavior and return codes.
12. Upgrade restores missing managed files and removes obsolete managed files under the same script/instruction protection rules. Locally edited scripts do not require confirmation. Missing removal targets are already absent and succeed.
13. Complete validation, inventory construction, state checks, destination checks, and all required confirmations before changing program files or durable ownership state. Validation or prompt failure leaves both unchanged. After application starts, stop on the first failure; do not roll back completed work.
14. Record an operation journal before the first file mutation. Record planned actions, old and intended baselines, resolved decisions, and progress. Persist enough information for future `doctor` work to identify a completed installation, modified or missing managed files, and incomplete install, upgrade, or removal work.
15. Bootstrap may retry an incomplete installation or upgrade only when the ownership record and journal are valid. It must repeat validation and edit protection. Public upgrade and self-removal refuse unresolved incomplete state and direct the user to bootstrap or future diagnosis. Do not adopt malformed state or unknown files.
16. Bootstrap offers permanent PATH setup only after successful program preparation when the user's shell and startup file can be determined safely. Ask before editing the startup file; `--yes` does not answer this question. With unavailable interaction or ambiguous shell setup, skip the edit and print a correctly quoted manual `PATH` command.
17. An approved PATH edit uses a unique marked block for the selected installation and is idempotent. Store the exact owned block and startup file in program state. Upgrade does not modify it. Self-removal removes only the recorded block and preserves all surrounding startup-file content.
18. `cr uninstall --self [--with-harnesses|--without-harnesses] [--force] [--yes]` removes only managed program files, program state, the owned PATH block, and empty directories created by Coderail. Preserve configuration and unrecognized contents; retain the installation directory when they remain.
19. Self-removal enumerates recorded harness installations through the sibling lifecycle. `--with-harnesses` selects all; `--without-harnesses` selects none. If harnesses exist and neither is supplied, ask a Yes/No question. `--yes` does not make that selection; unavailable input fails with guidance. Prepare all selected harness and program actions before any deletion, apply harness removal first, and do not remove the program after a harness failure.
20. Upgrade never changes installed harness files. Successful upgrade output reminds users to run `cr install <harness>` when they want updated harness instructions.
21. Keep every script POSIX-shell compliant. Make newly added scripts executable. Follow existing command dispatch, logging, filesystem, and focused-test conventions.

## Implementation Decisions

### Public and private interfaces

`INSTALL` contains only bootstrap acquisition, target validation, temporary-resource cleanup, and private handoff. It does not source helpers from an existing installation. Its source validation must require the target contract marker, `bin/cr`, `lib/`, `instructions/`, and the target lifecycle entry point; it must not retain the deleted `lib/utils/archive_apply.sh` dependency.

The target receives a versioned private contract, selected before normal command configuration or public option parsing:

```text
CODERAIL_INTERNAL_INSTALL=1
CODERAIL_INTERNAL_SOURCE=<canonical extracted root>
CODERAIL_INTERNAL_DESTINATION=<canonical install root>
CODERAIL_INTERNAL_CHANNEL=release|canary
CODERAIL_INTERNAL_VERSION=<resolved tag or commit>
CODERAIL_INTERNAL_COMMIT=<resolved commit>
CODERAIL_INTERNAL_ORIGIN=bootstrap|upgrade
```

Reject incomplete, inconsistent, unknown-version, overlapping source/destination, or public attempts to use this mode. The target validates the contract marker before mutation. The marker is non-executable data so old releases without the contract fail clearly instead of running incompatible installation code.

### Acquisition

Resolve GitHub refs through its HTTPS API, including annotated-tag dereferencing. Parse only the required response fields with POSIX utilities; never source response data. `latest` must resolve to a stable `vX.Y.Z` release and agree with the release's declared `lib/version.sh` value. Explicit tags may select prereleases only when their declared version agrees. For a release, download the archive created on GitHub for the resolved tag and fail clearly when it is absent or cannot be downloaded. For a canary, resolve the latest `main` commit and download GitHub's on-demand archive for that commit; no pre-created release archive is required. Record the resolved tag and commit for releases, or the commit for canaries.

Use a temporary directory created under `${TMPDIR:-/tmp}`. Inspect archive entry names and types before extraction. Permit one enclosing directory and regular files/directories only; reject absolute names, parent traversal, duplicate paths, links, devices, and other special files. Cleanup must never remove the destination.

### Program lifecycle

Add a focused utility under `lib/utils` with a program-specific prefix. Command modules parse and report; the utility inspects ownership, creates an ordered plan, resolves edit decisions, applies a prepared plan, and exposes read-only inspection for `doctor`. Shared helpers return status rather than exiting.

Store program ownership outside the installation at `${XDG_STATE_HOME:-$HOME/.local/state}/coderail/programs`, keyed by canonical absolute installation root. Use versioned non-executable, line-oriented data and POSIX `cksum` plus byte length. Reject tabs/newlines in paths represented by the record, duplicate entries, unsafe relative paths, invalid schemas, and symlinked managed destinations.

An active record contains the root, channel, completed and intended versions, inventory identity, managed files and baselines, Coderail-created directories, optional PATH-block ownership, operation status, and preservation outcomes. A journal records in-progress work separately or within the validated record. State publication uses same-directory temporary files and rename. Serialize lifecycle writers with a registry lock; do not steal stale locks.

For each action, recheck the observed state after prompts and immediately before mutation. Successful installation/replacement records the actual installed baseline. A deliberately preserved still-shipped instruction remains managed with its previous baseline. A deliberately preserved obsolete instruction or removal target is released from ownership and recorded as preserved. Failed or unattempted actions retain their prior ownership qualified by journal progress.

Import the prior v1 `<root>/.coderail-install` manifest only when no new record exists and only after strict validation of its checksum, length, path containment, permitted payload, and file types. A legacy manifest never authorizes adoption of unlisted files. Publish new ownership before retiring the legacy manifest; invalid or conflicting state fails unchanged.

### PATH and self-removal

Use the declared user shell, not the interpreter running `INSTALL`. Support known shell startup locations conservatively: zsh uses `${ZDOTDIR:-$HOME}/.zshrc`; bash uses the first existing `.bash_profile`, `.bash_login`, or `.profile`, creating `.bash_profile` only when none exists. Other cases receive manual setup instructions. Only a recorded, byte-matching owned block may be removed; missing is already absent, while altered or duplicate blocks require manual correction.

Before self-removal, load reusable harness enumeration, preparation, confirmation, and application functions from the sibling lifecycle. Acquire its lock and the program lock in one documented fixed order. Keep removal code available outside the installation before deleting installed files. After selected harnesses succeed, remove program files, PATH block, state, and empty owned directories in that order. Preserve a small external outcome record for incomplete/completed removal diagnostics.

## Testing Decisions

Add focused executable tests for `INSTALL`, upgrade, uninstall, and the program lifecycle utility. Use the existing shell test harness and disposable `HOME`, XDG state, destination, startup files, archives, and harness roots. Stub network acquisition at the executable boundary; normal tests must not contact GitHub or alter a developer installation.

Cover:

1. Bootstrap defaults, custom destinations, all valid selectors, empty/invalid values, archive/ref/contract failures, prerequisites, cleanup, and paths containing spaces.
2. Commit-pinned handoff from the extracted target, no recursive download, internal-contract validation, and public refusal of relocation/internal controls.
3. Fresh install, identical rerun, upgrade, downgrade, missing-file restoration, obsolete cleanup, unmanaged conflicts, legacy-manifest migration, and configuration preservation.
4. Edited current and obsolete instructions for every `--force`/`--yes` combination; edited scripts; confirmation defaults, invalid input, EOF, and noninteractive mode; resulting ownership and reports.
5. Validation and prompt failure before mutation; injected write/state/PATH failures after application begins; first-failure stopping, truthful completed/preserved/unattempted reports, incomplete journals, locks, and bootstrap recovery.
6. PATH detection, explicit approval, noninteractive manual guidance, quoting, idempotence, altered owned blocks, and self-removal cleanup.
7. Self-removal with each harness-selection mode, no harnesses, custom recorded harness roots, combined preflight failure, deliberately preserved files, and harness failure preventing program deletion.

Run new tests directly with `sh`, syntax-check changed scripts with `sh -n`, and run `./bin/cr test <changed-paths...>`. Add narrow test-map coverage for new program lifecycle files and `INSTALL`; direct tests remain required because the current map masks matching failures with `|| :`. Do not run `./tests/all.sh` unless shared behavior changes warrant it.

## Out of Scope

* Harness rendering and standalone harness lifecycle implementation, which belong to the sibling specification.
* `doctor` repair behavior, automatic rollback, arbitrary state adoption, configuration migration, and release publishing or creation of release archives.
* Templates, project initialization, repository workflow commands, package-manager distribution, archive signing, and arbitrary Git refs.
* Automatic updates to installed harness instructions during program upgrade.

## Assumptions

* `CODERAIL_INSTALL_DIR` supersedes the provisional `CODERAIL_HOME` name in the idea because it is the current `INSTALL` interface.
* The release workflow's annotated `latest` tag remains the stable-release authority.
* State external to the installation is required to support self-removal, earlier custom destinations, and incomplete-operation diagnosis.
* The sibling harness lifecycle will expose the preparation/application and enumeration contract described in its specification before composed self-removal is implemented.

## Further Notes

The previous bootstrap implementation was removed because it depended on the no-longer-present `lib/utils/archive_apply.sh` and only allowed an empty destination. This specification replaces that obsolete handoff with the target-owned private installation contract and explicit ownership handling. Existing unrelated working-tree changes remain outside this scope.

## Ticket Plan

1. [Program ownership and upgrade lifecycle](../../../tickets/open/0001-implement-program-ownership-and-upgrade-lifecycle.md)
2. [Standalone bootstrap installer](../../../tickets/open/0002-add-standalone-bootstrap-installer.md) (depends on 0001)
3. [PATH setup and self-removal](../../../tickets/open/0003-compose-path-setup-and-self-removal.md) (depends on 0001 and the sibling harness lifecycle contract)
