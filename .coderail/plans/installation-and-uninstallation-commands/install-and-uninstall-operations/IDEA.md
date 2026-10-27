---
title: Install and uninstall operations
status: ready
---

## Desired Outcome

Install, update, and remove harness instructions through shared operations that
apply consistent file-protection, confirmation, and ownership rules.

## Understanding

- Inherit the agreed policies in [the parent idea](../IDEA.md).
- Own command parsing, harness selection, shared operations, reporting, and exit
  status. Connectors supply paths, installation root, manifest location, and
  transformed file content; they do not perform installation or manage manifests.
- Consume the contract defined by the
  [common harness connector](../common-harness-connector/IDEA.md) idea. Resolve
  that idea before this idea proceeds to specification and tickets.
  Harness-specific mapping and transformation belong to the sibling connector
  ideas.

## Decisions

- Use the configured default when no harness is named; no default is a usage
  error. `uninstall --self` reports not implemented.
- Deduplicate repeated harness selections. Validate every harness argument before
  processing any harness; an unknown harness is a usage error and prevents all
  changes, even when other selections are valid.
- `--yes`/`-y` and `--no`/`-n` require `--force` and are mutually exclusive.
- Shared operations own manifest loading and validation, conflict preflight,
  confirmation, file changes, and manifest updates using `InstallManifest`.
- Connectors prepare the complete desired file set and transformed content in
  memory before shared operations change installed files. Mapping or
  transformation failures fail that harness before changes begin. Temporary-file
  staging is unnecessary for the small bundled instruction assets.
- Preflight each harness before changes; attempt selected harnesses independently.
- Installation destinations that are directories, symlinks, or other non-regular
  file types fail preflight, even with `--force`. Replacement and removal operate
  on regular files only.
- Declined overwrites preserve the baseline. Declined removals leave files but
  remove their manifest entries, transferring ownership. Declines are successful
  outcomes and skipped files are reported.
- Remove obsolete tracked files during reinstall using the same protection rules.
- Missing tracked files require no confirmation and are not failures. Reinstall
  recreates files still bundled and drops entries for obsolete files. Uninstall
  drops entries for files already absent.
- Remove the manifest whenever no tracked entries remain. Preserve a nonempty
  manifest after a partial failure where possible.
- After removing tracked files, remove their empty containing directories and
  walk up through empty parents, stopping before the connector's installation
  root. Apply this to uninstall and obsolete-file removal during reinstall;
  leave unrelated empty directories untouched. Perform directory cleanup while
  the manifest still exists in the installation root, and delete an empty
  manifest as the final operation. Never remove the installation root itself.
- Unexpected errors stop that harness without rollback; preserve completed work
  in its manifest where possible and continue other selected harnesses.

## Assumptions

- Bundled instruction assets are small enough to prepare fully in memory.

## Risks and Caveats

- Preparation and preflight do not make installation atomic. Unexpected file or
  manifest errors can leave partial changes, as covered by the inherited failure
  policy.
- Bundle-loading ownership and shared connector interface decisions belong to
  the common harness connector idea. Harness-specific mapping and transformation
  decisions remain with the sibling connector ideas.
