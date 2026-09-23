## Problem Statement

`INSTALL` and `cr upgrade` can already acquire and extract a target release, but the target release's private `_internal_install` operation is a stub. Consequently, neither path can apply the extracted release. Users also need upgrades to preserve their edits to bundled, user-facing content without treating Coderail program files as customization points.

The installer needs durable, local ownership data so it can distinguish an edited managed file from an unmanaged collision, update unchanged files safely, and release ownership of deliberately preserved obsolete content.

## Goal

Implement the private installation operation that installs an already extracted Coderail payload into a selected destination and maintains `<install-dir>/.coderail/install.manifest`. It must protect modified bundled instructions and templates, always replace Coderail program files, and fail before mutation when it cannot safely prepare the requested operation.

## Solution Overview

Keep `INSTALL` and the public half of `cr upgrade` responsible for acquisition and extraction. The extracted target release remains responsible for applying itself: its `upgrade` command enters a private internal-install path when `CODERAIL_INTERNAL_INSTALL=1`, receives the extracted source and target destination, builds a complete installation plan, resolves required confirmations, then applies the plan.

The implementation records managed files in a versioned, line-oriented manifest below the destination. The manifest stores an immutable baseline checksum for each managed file and classifies it as either a replaceable program file or protected user-facing content. On every later run, the planner uses that baseline—not equality with the incoming release—to identify a local edit.

This specification covers the ready [internal-installation idea](IDEA.md), one independent leaf of the split [Coderail v2.0 idea](../IDEA.md). The earlier sibling installation specification is explicitly obsolete for this work and is not a source of lifecycle, external-state, PATH, download, or self-removal requirements.

## Requirements

1. The private operation requires `CODERAIL_INTERNAL_INSTALL=1`, `CODERAIL_INTERNAL_SOURCE`, and `CODERAIL_INTERNAL_DESTINATION`. It must reject missing, non-directory, overlapping, or otherwise unsafe source/destination roots before modifying the destination. It installs already-extracted content only; it never downloads, extracts, changes PATH, or re-enters public upgrade.
2. The payload inventory contains only regular files below the allowed top-level roots: `bin/`, `lib/`, `instructions/`, and, when introduced, `templates/`. `bin/` containing executable `bin/cr` and `lib/` are required by the current executable contract. `instructions/` and `templates/` are optional roots, so a release that omits one makes its formerly managed files obsolete. All repository/development material—including source `.coderail/`, `tests/`, `build/`, editor files, repository metadata, and `INSTALL`—is ignored and never installed or recorded.
3. Reject a selected payload root that is not a real directory, and reject symbolic links, devices, FIFOs, sockets, or other non-regular content anywhere below a selected root. Enumerate accepted files in deterministic locale-independent relative-path order. Preserve the source bytes and executable/non-executable mode when installing a file.
4. Persist a valid manifest at `<destination>/.coderail/install.manifest`. It must contain every currently managed payload file and its baseline POSIX `cksum` checksum and byte length. The manifest itself and its containing `.coderail` directory are installer metadata, not payload entries.
5. The manifest format is schema version 1:

   ```text
   coderail-install-manifest<TAB>1
   file<TAB>program|protected<TAB>relative/path<TAB>checksum<TAB>byte-length
   ```

   Each record ends in one newline. `program` is valid only under `bin/` or `lib/`; `protected` is valid only under `instructions/` or `templates/`. Checksums and byte lengths are unsigned decimal values emitted by `cksum`. Records must be canonical-path ordered and unique. Empty lines, comments, unknown fields/kinds/schema versions, non-decimal metadata, duplicate paths, paths outside the allowed roots, or noncanonical/unsafe paths make the manifest invalid.
6. A valid manifest is the sole authority for existing managed files. If no valid manifest exists, every existing required destination file—including an existing `install.manifest`—is unmanaged. Before changing anything, report every destination collision with an unmanaged file, link, or wrong-type required path and instruct the user to move it before retrying. An otherwise unrelated non-conflicting destination directory is allowed.
7. Program files (`bin/**` and `lib/**`) are never protected customization points. A valid manifest authorizes their replacement or removal even when their current bytes differ from the recorded checksum. An incoming missing program file is recreated; an obsolete program record is removed, with an already absent file reported as such.
8. Bundled files under `instructions/**` and `templates/**` are protected. For a currently shipped protected file whose present regular-file checksum differs from its recorded baseline:

   - Without `--force`, preserve it, retain its prior manifest baseline, and report it as preserved while continuing with all eligible actions.
   - With `--force`, request a separate replacement confirmation. Yes replaces it; No/default preserves it with the prior baseline. `--force --yes` approves these per-file replacement confirmations.
   - `--yes` without `--force` does not authorize replacement and has the same preservation behavior as no force.

   A missing protected destination file is an absent managed file and is recreated without confirmation. Treat a non-regular destination entry as locally modified for this policy; never follow a destination symbolic link while checking or applying a managed-file action.
9. When a manifest-managed file is absent from the incoming payload, remove an unmodified program or protected file. For an edited protected file, preserve it without force and report it; with `--force`, request a separate deletion confirmation, with `--force --yes` approving it. A preserved obsolete protected file is omitted from the next manifest and becomes user-owned. Later installs leave it untouched.
10. Confirmation is shared through `log_confirm <question>` in `lib/utils/log.sh`. It writes a `[y/N]` question to stderr, reads stdin only when both stdin is a terminal and existing `log_interactive` permits interaction, accepts `y`/`yes` and `n`/`no` case-insensitively after trimming surrounding whitespace, reprompts other input, and treats an empty answer as No. It returns `0` for Yes, `1` for No/default, and `2` for unavailable input or a read error after logging the input failure. Its caller, rather than the utility, owns force/yes policy.
11. If an edited protected file needs a `--force` confirmation and interaction is unavailable without `--yes`, fail before any filesystem change and direct the user to rerun interactively or with `--force --yes`. A user declining a confirmation is a successful preservation decision, not an error.
12. Build and validate the full inventory and manifest state before creating directories, copying files, removing files, or publishing manifest state. Validate source types, manifest syntax and ownership, destination types and collisions, safe parent paths, and all required confirmations first. Recheck the selected source/destination/manifest preconditions after confirmations and immediately before each action; a later conflict or filesystem failure is an application failure, not authority to overwrite it.
13. After successful preparation, create required real directories, copy replacements through a same-directory temporary file and rename, and remove only planned managed paths. Stop at the first write, rename, deletion, or manifest-publication failure. Do not roll back completed changes. Report completed, preserved, failed, and unattempted paths accurately; deliberate preservation counts as a successful operation.
14. Publish manifest updates with a same-directory temporary file and rename. After each completed file action or ownership-release decision, publish the manifest snapshot that reflects all completed actions to that point. If publication fails after a file change, stop and explicitly report that the file changed but its new ownership baseline was not published. Do not silently adopt or repair the resulting partial state on a later install.
15. Add generic, POSIX-only helpers to `lib/utils/path.sh`, not installer-specific duplicate logic:

   - `path_checksum <regular-file>` writes the checksum and byte length obtained by feeding the file to `cksum`, and fails without output for an unreadable, non-regular, or checksum-failing input.
   - `path_manifest_relative <path>` writes a canonical, nonempty, safe relative manifest path. It rejects absolute paths, parent escapes, `.`, disallowed payload roots, noncanonical spellings, and tab or newline bytes that cannot be represented by the line format.
   - `path_manifest_target <absolute-root> <relative-path>` validates the relative path with the preceding helper and writes the lexical destination below that root. It does not follow links; callers remain responsible for checking actual filesystem components.

   These helpers return status and do not log or exit, so the internal installer and future inspection/repair commands can use them directly. `cksum` is accidental-local-edit detection only, not release authentication or a security boundary.
16. Keep public `cr upgrade` option parsing and acquisition outside the private installer, but forward its selected flags to the extracted target exactly: append `--force` when force is set and `--yes` when yes is set. The bootstrap has no corresponding overwrite override. `CODERAIL_INTERNAL_ORIGIN=install|upgrade` remains private context. It does not alter v2 file-protection behavior, but an upgrade uses it to detect and replace a v1 installation as described below.
17. All shell code remains pure POSIX shell. New shell scripts must be executable.

## Implementation Decisions

### Boundaries and interfaces

`lib/commands/upgrade.sh` remains the command-facing module: it parses public options, obtains/extracts the target when not in internal mode, forwards force/yes, and delegates internal application. Move the private planning and application functions into `lib/commands/upgrade/internal_install.sh`, sourced only by the upgrade command. This keeps download/public CLI behavior separate from the stateful file lifecycle and leaves a small testable internal interface.

The internal module consumes the three `CODERAIL_INTERNAL_*` inputs, the parsed `force`/`yes` values, `path.sh` helpers, `log_confirm`, and existing logging/filesystem primitives. It must canonicalize source and destination enough to reject self/overlapping trees and to ensure it never treats the extracted tree as an installation target. The current callers already provide `install` and `upgrade` origins; no new externally supported environment interface is introduced.

Only the module owns manifest parsing, inventory construction, planning, application, and outcome reporting. Generic checksum and manifest-path validation live in `path.sh`; generic question handling lives in `log.sh`. No harness registry, external ownership store, operation journal, PATH editor, removal command, or doctor repair API is added here.

### Inventory and manifest data contract

Inventory records carry the canonical relative path, `program` or `protected` kind, incoming checksum/byte length, and source file. Kind is determined by the payload root and is persisted so obsolete protected files continue to receive the correct policy after their source disappears. The incoming `templates/` root is included once it exists; no template-creation behavior is part of this scope.

The internal module reads a manifest strictly rather than attempting migration or recovery. A malformed, missing, unreadable, or unsupported manifest is not partially trusted. Its files have no managed authority, and the existing metadata file becomes an unmanaged collision if publishing a new manifest would require replacing it. This prevents a corrupted record from authorizing an overwrite.

Paths support ordinary spaces and shell metacharacters. The schema intentionally rejects tabs and newlines because its records are tab- and newline-delimited. The planner must quote every pathname, consume path-helper output rather than shell-evaluating it, and reject paths that resolve outside the allowed payload roots. It must require real destination directory components along managed paths; a destination symlink is never traversed as a managed target.

### Planning, ownership transitions, and application

Planning first forms the union of incoming inventory and prior manifest records. It classifies each entry as create, replace, unchanged, remove, already absent, preserve, or collision. A missing managed file with an incoming source is recreated; an existing non-regular protected target is an edit subject to protection. Exact source equality does not erase an existing checksum mismatch: an edited protected file is still protected even if it happens to match the newly shipped bytes. A protected file preserved while still shipped keeps its previous manifest record and old checksum. An obsolete protected file preserved after its source disappears is excluded from the next snapshot, which releases it to the user.

Before the first mutation, preflight collects every unmanaged collision and resolves every required confirmation. Invalid input—not an explicit No—aborts the whole operation. Parent permission checks are advisory preflight checks only; each action still handles a later filesystem error. The implementation must not use `/dev/tty` to evade noninteractive mode.

Application uses the prepared deterministic action order. It creates a staged copy in the target file's parent and renames it into place, avoiding truncation of the live file while preparing a replacement. It does not follow a target link. After each successful creation, replacement, removal, already-absent removal transition, or obsolete-protected release, it atomically publishes the next complete manifest snapshot. The snapshot is updated with the checksum of bytes actually copied, not merely the preflight source checksum. A preserved current protected file need not republish a record when its baseline is unchanged.

Reports name destination-relative paths and use the terms `created`, `updated`, `removed`, `already absent`, `unchanged`, `preserved`, `failed`, and `not attempted`. They distinguish a filesystem mutation that succeeded from a later manifest write that failed.

### Compatibility

During a private upgrade only, a real, non-symlink `<destination>/.coderail-install` file identifies a v1 installation. After validating the payload and roots, the installer confirms replacement (or accepts `--yes`), archives the complete installation directory to a unique sibling `.tar.gz`, then replaces it with a fresh v2 installation. It never reads or validates the v1 marker contents. A declined or unavailable confirmation and archive-creation failure leave the v1 installation unchanged; a later replacement failure retains and reports the completed archive without rollback. Bootstrap installation retains the normal no-manifest collision behavior.

Apart from that v1 upgrade path, there is no migration or adoption-by-content rule. Existing destinations without this manifest, including byte-identical Coderail-looking files, are unmanaged and require user action before the installer can use those paths. Directories are created as needed but not recorded as payload ownership, so empty obsolete directories may remain.

The installed release need not contain a current `instructions/` directory for the operation to be valid: the repository currently has no such payload directory. If a later release adds it, it is automatically protected by the root classification. If a release omits it after it was managed, the normal obsolete-file policy applies.

## Testing Decisions

Add focused executable tests in `tests/utils/path.test.sh`, `tests/utils/log.test.sh`, `tests/commands/upgrade.test.sh`, and `tests/commands/upgrade/internal_install.test.sh`. Follow the existing `tests/suite.sh` style, give every case a `mktemp -d` fixture root and cleanup trap, and exercise command functions in fresh `sh -eu` processes where errexit behavior matters. Fixtures must provide disposable source trees and destination directories; normal tests must not download a release or touch a developer installation.

Direct `path.sh` tests must cover known `cksum` outputs and lengths, unreadable/non-regular failure, canonical safe relative paths, spaces/metacharacters, all rejected traversal/absolute/empty/tab/newline forms, and root joining. `log_confirm` tests must cover accepted answers, No/default, invalid-answer reprompting, stderr prompting, `NON_INTERACTIVE`/`--non-interactive`, redirected stdin, and EOF/unavailable status. Use a pseudo-terminal where a real terminal is needed to demonstrate the accepted confirmation path.

Internal-install fixtures must cover:

1. Fresh installation from the restricted payload only; required-root/source-type rejection; copied content and modes; deterministic manifest content; and ignored repository files.
2. Idempotent rerun, program-file replacement after local edits, restoration of a missing managed file, changed protected files, and future `templates/` classification.
3. All protected-file choices: no force, yes alone, force with Yes/No/default, force plus yes, unavailable required confirmation, and mixtures of preserved and replaced files. Assert bytes, baselines, manifest membership, report category, and exit status.
4. Obsolete program and protected files, including unchanged deletion, already absent entries, each force/yes deletion choice, and release of preserved obsolete protected content so later runs leave it untouched.
5. No-manifest, malformed-manifest, invalid-record, duplicate, unsafe-path, unmanaged ordinary-file, byte-identical-file, wrong-type, and symlink collision cases. Verify every affected destination path remains unchanged and all conflicts are reported before mutation.
6. Preflight validation or prompt failure leaves files and manifest byte-identical. Simulate a changed precondition and copy/remove/rename/manifest-write failure after application begins; assert first-failure stopping, correctly classified completed/failed/unattempted work, and the snapshot state after each successful action.
7. Public-upgrade handoff carries neither flag, each individual flag, and both flags to the target internal invocation, without contacting GitHub. Verify the internal branch uses the parsed values and bootstrap remains an unforced fresh-install caller.

Syntax-check every changed shell script with `sh -n`, then run the new tests directly with `sh` and run `./bin/cr test` for the changed `lib` paths. The current `.coderail/test_map` ends its mapped command with `|| :`, which can mask a test failure, so direct test execution is required. Do not run `./tests/all.sh` unless the final implementation changes shared behavior beyond these focused areas.

## Out of Scope

* Archive download/extraction, release selection, bootstrap CLI expansion, PATH setup, and public upgrade UX beyond forwarding the two already parsed flags.
* Self-removal, external installation registries, operation journals, automatic rollback, state repair, and `doctor` behavior.
* Harness instructions/skills installation and removal, project initialization/template authoring, repository plans/tickets, and Git helpers.
* Release signing, cryptographic authenticity verification, general migration/adoption of pre-manifest installations, or preservation of arbitrary POSIX pathnames that cannot be represented in the manifest schema.

## Assumptions

* `CODERAIL_INTERNAL_DESTINATION` supplied by current callers denotes the intended installation root; the internal operation may reject unsafe overlap rather than relocating it.
* The current `install` and `upgrade` values of `CODERAIL_INTERNAL_ORIGIN` remain sufficient: only `upgrade` enables v1 migration, while neither changes v2 file-protection behavior.
* POSIX `cksum` is available wherever Coderail runs, and its checksum plus byte length is adequate only for detecting accidental local content changes.
* Source payload filenames are under Coderail release control. Rejecting tab/newline-bearing managed paths is acceptable to retain a simple, inspectable POSIX line format.
* A subsequent diagnosis/repair capability may inspect a partial or stale manifest, but this installer must not itself attempt repair or silently re-adopt it.

## Further Notes

The existing public flow already invokes the extracted target's own `bin/cr`, so no installed Coderail configuration is required for the initial internal operation. The current worktree has no `instructions/` directory even though the product model reserves that protected root; treating it as optional keeps this scope implementable today and compatible with its planned introduction.

The root test map naturally maps the nested implementation module to `tests/commands/upgrade/internal_install.test.sh`, but its trailing `|| :` is insufficient as a pass/fail signal. Focused test scripts are therefore the source of truth for this change.

## Ticket Plan

No tickets created. A later ticket breakdown can separate shared path/confirmation primitives, private installation planning/application, and focused integration coverage while retaining this one specification as their common contract.
