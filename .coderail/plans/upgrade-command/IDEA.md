---
title: "Upgrade command"
status: "ready"
---

Explore implementation of `src/commands/upgrade.ts`.

## Current understanding

- The command is currently a stub: parsing discards all arguments, help handling returns false, and execution does nothing.
- Help describes stable version selection and mutually exclusive `--canary` for unreleased changes. Stable selection and canary publication assumptions are agreed below. Help will need to include optional `v` prefixes for partial versions too.
- The command does not require an initialized project.
- `install.sh` currently only sets the repository URL; no usable bootstrap/update implementation is present there.
- Runtime context exposes an installation root derived from the resolved entrypoint (`src/runtime/context.ts`).
- `cr install` and `cr uninstall` copy/remove instructions for specific harnesses. They are distinct from upgrading the Coderail distribution and are outside this upgrade scope.

## Agreed installation model and scope

- Initial installation is bootstrapped by `install.sh` (not implemented yet). It downloads the latest tagged compiled executable appropriate to the OS/architecture, places it in a default or user-selected directory, and invokes its upgrade command.
- The executable is compiled from this TypeScript application. Subsequent distribution installation work belongs to `cr upgrade`.
- Upgrade downloads the selected GitHub release archive containing assets and the compiled executable.
- Upgrade replaces distribution assets while preserving non-conflicting user-created templates. A user-created template at an incoming release path may be overwritten with explicit force confirmation, including `--force --yes`.
- Activation switches the stable launcher to the new executable. The old executable is removed afterward, with deferred cleanup where necessary as agreed below.
- Upgrade maintains its own distribution installation manifest, similar in purpose to the harness install manifest, to identify files eligible for removal/overwrite and protect user-created templates.
- Required platform matrix: Windows, macOS, and Linux, each with x64 and arm64 executables (six targets). This supersedes the earlier rough x86 mention.

## Agreed distribution layout

- Default install root: `~/.coderail`; users may select a different root during bootstrap.
- `assets/` is only a development repository organization directory. It must not appear as an extra directory level in the installed distribution.
- Repository `assets/instructions/` is installed as `<install-root>/instructions/`; repository templates are installed as `<install-root>/templates/`.
- Executables use the compact layout: on Linux/macOS `<install-root>/bin/cr` is a symlink targeting `<install-root>/libexec/cr-<version>`. On Windows `<install-root>/bin/cr.cmd` is a launcher forwarding arguments to the active private `.exe` in `libexec`, avoiding a symlink privilege requirement. Only `<install-root>/bin` belongs on PATH; versioned executables are not exposed there. Launcher quoting, exit status propagation, and private build naming are implementation details to verify.
- The distribution manifest lives at the stable installation root; its filename remains an implementation choice.
- Release packaging and installed resource lookup must follow this flattened layout. Check existing consumers during implementation rather than assuming repository paths remain valid after compilation.

## Agreed bootstrap contract

- `install.sh` puts the downloaded compiled executable directly in `<selected-root>/libexec/` and invokes its upgrade command by physical path.
- Upgrade derives the selected installation root from its own executable location; no installation-directory flag is needed for this bootstrap contract.
- Upgrade completes installation of instructions/templates, creates the initial distribution manifest, and establishes `<root>/bin/cr`.
- Bootstrap integration with PATH belongs to the deferred installer work; only `<root>/bin` should be exposed. Windows feasibility: updating the current user PATH does not require administrator privileges; changing the machine-wide PATH does. PATH permissions therefore do not inherently require an elevated per-user installation, unlike Windows symlink creation without Developer Mode. References: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd and https://learn.microsoft.com/en-us/windows/win32/shell/user-environment-variables .
- Initial bootstrap reconciliation must recognize the running bootstrap executable as such rather than reject it as an untracked conflicting file.

## Agreed stable version selection

- Omitted `--version`, or `--version latest`, selects the newest stable release.
- `X` / `vX` selects the newest stable release matching that major version.
- `X.Y` / `vX.Y` selects the newest stable release matching that major/minor version.
- `X.Y.Z` / `vX.Y.Z` selects that exact release. Explicit selection permits downgrades.
- Every numeric selector accepts an optional leading `v`.
- Selecting the already-installed version still reconciles assets against the installation manifest. This supports bootstrap completion and restoration of missing files; it does not bypass conflict/confirmation rules.
- `--canary` and `--version` are mutually exclusive.

## Canary and publishing

- Canary must automatically follow main, without manual selection of commits for publication.
- User accepts that a published canary may be functionally broken, including breaking upgrade itself. Manual removal and rebootstrap through `install.sh` is an acceptable recovery path; automatic recovery from broken canary application behavior is not required.
- Agreed publishing assumption: GitHub Actions builds the pushed main tip automatically and publishes six platform archives to a dedicated `canary` prerelease, identifying the source commit in each build. Tagged stable releases publish the same six platform variants. Each archive contains its platform executable, instructions, and templates.
- Failing tests do not block canary publication. Successful compilation and packaging are required to produce usable release artifacts.
- Publish after all six archives are ready and prevent older builds from replacing newer canaries.
- GitHub Actions implementation is deferred to separate work. For this upgrade exploration, assume these publishing workflows exist; define only the release-consumption contract upgrade needs.
- A push containing multiple commits ordinarily builds the resulting branch tip, not each intermediate commit. Upgrade must consume assets belonging to one resolved build using the agreed archive/build identity contract below.
- Verified against current Deno docs: all six requested cross-compilation targets are supported; Windows arm64 requires Deno 2.9.3 or later. Local Deno is 2.9.8.
- Technical references: https://docs.deno.com/runtime/reference/cli/compile/ ; https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows ; https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases . GitHub supports push-triggered workflows and multiple binary assets on a release.

## Agreed conflict controls

Follow the existing `install`/`uninstall` policy, using the newly added upgrade help flags:

- `-f` / `--force` enables conflicting overwrite/removal actions, subject to confirmation for each action.
- `-y` / `--yes` and `-n` / `--no` require `--force` and are mutually exclusive.
- Unchanged managed files can be replaced or removed without confirmation; missing managed files can be restored.
- Without `--force`, locally modified managed files requiring overwrite/removal cause an error during planning, before file changes.
- With `--force`, confirm each conflicting action; `--yes` approves and `--no` declines automatically. Declined actions preserve their files while other eligible actions continue, as in install/uninstall.
- The distribution manifest must retain the prior baseline for tracked files whose actions were declined, and record actual successful writes/removals rather than claiming the entire release was installed unchanged.
- An untracked existing destination, including a user-created template at an incoming release path, is a conflict under the same rules. `--force` plus affirmative per-file confirmation, or `--force --yes`, permits overwriting it. A declined action preserves it and does not claim ownership in the manifest. Unrelated untracked templates are never removed; force does not authorize blanket directory deletion.

Reference behavior: `src/commands/install.ts` (`planInstallation`, argument validation) and `src/commands/uninstall.ts` (modified-file removal, declined actions, manifest persistence). Uninstall explicitly rejects a required prompt without an interactive terminal; upgrade should define the same situation before implementation.

## Agreed upgrade sequence and failure policy

1. Resolve the release/build and download its matching platform archive.
2. Extract into staging, validate package contents and installation paths, inspect manifest ownership/conflicts, and resolve all required confirmations before changing installed files.
3. Apply approved asset writes/removals and persist the distribution manifest describing the actual resulting managed files, including retained baselines for declined actions.
4. Switch the stable launcher (symlink on Linux/macOS, command launcher on Windows) only after asset and manifest updates succeed.
5. Remove the previous executable after successful activation; on Windows use deferred post-exit cleanup as agreed below.

- Automatic rollback/recovery is explicitly out of scope. Preflight validation and confirmation planning are the agreed protection against predictable failures.
- Runtime failures during mutation can leave a partial installation; keeping the old executable link until activation does not guarantee its assets still match.
- On failure midway, report partial progress and instruct the user to manually remove the affected installation and bootstrap again using `curl` and `install.sh`. Guidance must identify the actual selected root, including custom roots, and explain that removing the whole root also removes user-created templates so users can preserve them first.
- Windows feasibility finding: mapped running executable images cannot ordinarily be deleted while running (Microsoft: https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/executable-images).
- Deferred post-exit cleanup is accepted: a short-lived helper waits for the upgrading process to exit and removes the retired executable. If cleanup fails after successful activation, leave the new installation active and report the residual executable. The stable bin link must already point to the new executable.
- Subsequent upgrades retry cleanup of stale distribution executables in `libexec`, rather than accumulating residual versions indefinitely.
- Cleanup boundary: only retired Coderail executables identified as distribution-owned, never arbitrary untracked contents. Protect the running executable, current stable link target (which can differ when invoking an executable directly), and the selected staged executable. Coordinate cleanup with activation so concurrent upgrades cannot delete each other's binaries. Exact ownership identification/coordination is an implementation detail.
- Agreed: stale cleanup belongs at the beginning of the mutation phase, after validation and confirmations, preserving the preflight-before-mutation contract.
- A stale file still in use or otherwise undeletable is reported and retained for another retry; stale cleanup must not require removing a functioning installation.


## Relevant existing mechanisms

- `src/install-manifest.ts` and its helpers provide a versioned list of relative file paths, SHA-256 checksums, and sizes, plus capture/inspection/load/save operations.
- Existing inspection distinguishes unchanged, modified, and missing files. These mechanisms can inform distribution ownership tracking; the distribution manifest must have its own scope, separate from harness manifests.
- The current runtime derives the install root from the executable's resolved physical path. The eventual executable layout must be consistent with this or require updating that contract.

## Implementation freedom and deferred work

- No consequential product decisions remain open for upgrade. Keep this as one implementation-ready idea; decomposition is not needed to preserve the agreed contracts.
- Delegate helper/module boundaries, exact manifest/build metadata schemas, checksum filename, extraction implementation, locking, staging paths, and deferred cleanup mechanics to implementation, preserving the behavior described here.
- Reuse existing non-interactive confirmation semantics: a conflict requiring a prompt without an interactive terminal fails during preflight unless `--yes` or `--no` supplies the answer.
- Same-version reconciliation must not truncate/overwrite the running executable. Reuse a verified matching executable or stage a distinct physical executable before activation; deleting the active executable is never required for reconciliation.
- GitHub Actions and `install.sh` implementation are separate future work. Upgrade tests should use release/package fixtures rather than depend on those workflows already being deployed.
- Stable release workflow: the maintainer tags the chosen commit and pushes the tag; the assumed workflow builds that exact revision, creates the corresponding GitHub Release, and attaches the compiled packages/checksums. Automatic GitHub source archives remain separate and are not upgrade inputs.

## Agreed release consumption contract

- One ZIP archive per Deno target triple, named `coderail-<target>.zip`, attached to each stable release and the canary prerelease.
- Archive root contains `cr` (or `cr.exe`), `instructions/`, `templates/`, and `build.json`; no repository `assets/` level.
- Build metadata identifies release version, source commit, and target. Canary executable identity includes the commit so distinct canary builds do not share a destination filename.
- Publish SHA-256 archive checksums. Upgrade resolves metadata/asset identity once, validates the downloaded archive and build identity, and fails before mutation on missing, mismatched, or changing publication data.
- GitHub repository currently indicated by `install.sh`: `pavelmudroch/coderail`; use this as the existing source unless changed by the user.
- Actual workflow implementation remains deferred.

## Verification expectations

- Help and invalid arguments never perform an upgrade.
- Verify mutually exclusive selection flags; `X`, `X.Y`, and `X.Y.Z` with and without leading `v`; default/latest stable selection; explicit downgrades; and same-version reconciliation with conflict protection.
- Verify force/yes/no argument rules, per-file confirmation, declined overwrite/removal actions, and manifest baselines for preserved files.
- Exercise version resolution, already-current behavior, and update failures without changing the actual developer installation. Verify Windows launcher forwarding for arguments with spaces/quotes and exit status; verify Linux/macOS symlink activation.
- Verify that unrelated user-created templates survive upgrades; colliding templates require force and affirmative confirmation, with `--force --yes` approving overwrite and `--force --no` preserving them. Verify obsolete managed files are removed according to the agreed ownership policy.
- Exercise first-install bootstrap with default and custom roots, direct `instructions/` and `templates/` resource lookup without an `assets/` level, activation, manifest consistency, and cleanup across supported platforms.
- Verify stale binary cleanup protects the running executable, stable link target, staged executable, and untracked files; residual deletion failures remain retryable; deferred cleanup happens after process exit.
- Verify downloads, extraction, validation, and all confirmations finish before installed-file mutation; asset/manifest failure prevents activation; failures report partial state and manual removal/bootstrap guidance; no automatic rollback is required.

## Exploration tooling

The installed `cr` rejects this checkout's `.coderail/coderail.conf` at `[verify]`, so command discovery used `cr --help` from `/tmp`. This idea was created directly in the established format. Readiness is set through the checkout CLI when possible; no configuration or source files were changed by this exploration.
