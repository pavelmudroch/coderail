---
title: Internal installation and manifest protection
status: ready
---

## Desired Outcome

The internal installation mode used by `INSTALL` and `cr upgrade` safely installs an already-extracted Coderail release into the selected installation directory, with a persistent manifest that protects locally modified managed files.

## Understanding

* This child owns the internal installation operation only: copying the downloaded release into its destination and maintaining its installation manifest. Archive download, extraction, public upgrade option parsing, PATH setup, and self-removal remain outside this scope.
* The bootstrap `INSTALL` script and a normal `cr upgrade` already download and extract a target archive, then launch the target archive's `cr upgrade` with `CODERAIL_INTERNAL_INSTALL=1`, a source path, and a destination path. `_internal_install` is currently a stub.
* The internal installer must install from that source tree into the destination, creating required directories and copying or replacing Coderail-managed files.
* It must persist a versioned, line-oriented installation manifest at `<install-dir>/.coderail/install.manifest`, containing every managed installed file and its checksum. On a later installation or upgrade, a current checksum different from the recorded checksum identifies a local modification.
* Checksum protection applies only to user-facing managed content, including instructions and bundled templates. Coderail program files such as `bin/cr` and `lib/**` are not customization points and are always replaced from the target release.
* Without `--force`, a locally modified protected managed file is preserved while the installer updates all program files and unchanged protected files. With `--force`, the installer requests confirmation for each edited protected file; Yes replaces that file and No preserves it while the remaining eligible files are updated. `--force --yes` approves those overwrite confirmations automatically.
* If `--force` requires confirmation but interaction is unavailable and `--yes` is absent, fail before changing any files and direct the user to rerun interactively or with `--force --yes`.
* If a manifest-managed file is absent from the incoming release, the installer removes it when its recorded checksum still matches. It preserves locally edited protected content and reports it. With `--force`, the installer asks before deleting each edited protected file; `--force --yes` approves the deletion. A file present in the incoming release replaces the installed copy, subject to the protected-content confirmation rule.
* A locally edited protected file preserved because it is no longer in the release is removed from the manifest and becomes user-owned. Later upgrades leave it alone.
* An internal installation that deliberately preserves edited protected files succeeds when all eligible file actions complete, and reports each preserved path.
* Each successfully created or replaced file receives its new manifest checksum. A preserved still-shipped protected file remains managed with its previous baseline checksum, so later upgrades detect its edit again.
* The public `cr upgrade` command forwards its `--force` and `--yes` choices into the private installation mode. `--yes` without `--force` never authorizes replacement or deletion of an edited protected file.
* If no valid Coderail manifest exists at the destination, existing files are unmanaged. The installer must fail before changes when any required destination path collides with an unmanaged file, and must identify each conflict and ask the user to move it before retrying. It may install into a directory that has unrelated, non-conflicting content.
* Reusable POSIX checksum and manifest-path helpers are a required shared utility contract in `lib/utils/path.sh`, not installer-specific logic. The later specification must define their callers, failure behavior, and focused direct tests so other commands can reuse them. The manifest uses `cksum` for accidental-local-edit detection; it is not a security or release-authentication mechanism.
* The release payload currently consists of `bin/`, `lib/`, and `instructions/`. A future `templates/` directory is also part of the payload when template functionality is introduced. Development and repository files, including `.coderail/`, `tests/`, `build/`, editor configuration, and repository metadata, are not installed or represented in the manifest.

## Decisions

* This is a new, independent idea. The prior [installation, upgrade, and removal specification](../coderail-installation-upgrade-and-removal/SPEC.md) is obsolete for this work and is left unchanged.

## Constraints

* All scripts and helpers must be pure POSIX shell.
* Internal mode must work before an existing Coderail installation or configuration exists and must distinguish source and destination paths.
* Detect conflicts and resolve all required confirmations before changing installed files so a refusal or unavailable required prompt leaves the destination unchanged.
* After successful preflight, stop at the first filesystem write or deletion failure without automatic rollback. Report completed, failed, and unattempted actions accurately.

## Risks and Caveats

* A write or deletion failure after application begins can leave a partial installation. The installer reports this state and does not roll it back automatically.
