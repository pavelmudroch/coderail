---
title: Reconcile protected harness installations
status: open
depends-on: 0005
---

# Reconcile protected harness installations

Make repeated installation refresh owned files, release obsolete ownership, and protect user edits through explicit per-file decisions.

## Tasks

1. [ ] Add refresh, obsolete-file, and confirmation fixtures
2. [ ] Plan current and obsolete managed paths from the manifest
3. [ ] Resolve edit decisions and apply protected reconciliation

## Task details

### 1. Add refresh, obsolete-file, and confirmation fixtures

Extend `tests/commands/install.test.sh` and the private lifecycle test with unchanged reruns, changed staged bytes, missing managed targets, mode changes, edits that equal new staged bytes, and removed source paths. Exercise default preservation, `--yes`, `--force` with Yes/No/empty responses, `--force --yes`, and unavailable input.

Expected outcome:

- Tests verify file bytes, modes, old or new checksum baselines, ownership release, and an unmanaged collision on later reinstall of a preserved obsolete file.
- Required unavailable input fails preflight without mutation and reports how to retry.

Validation:

- Run both focused tests directly with `sh` and confirm byte-identical installed state on failed preflight.

### 2. Plan current and obsolete managed paths from the manifest

Classify the union of staged inventory and old records as create, refresh, unchanged, remove, already absent, preserve, or conflict. Compare the current regular file's `cksum` and length with its recorded baseline before comparing it to staged bytes; mode alone does not mark an edit. An absent owned file may be recreated. A link is an edited leaf, never followed. Reject a directory or other nonreplaceable leaf and all unmanaged incoming targets.

Expected outcome:

- Still-shipped edits retained by default keep their old records; preserved obsolete files lose ownership. Unchanged obsolete files are removed and absent ones are released.

Validation:

- Run lifecycle fixtures for each state transition and malformed or changed metadata.

### 3. Resolve edit decisions and apply protected reconciliation

Use `log_confirm` once per edited current or obsolete file when `--force` is set, storing all decisions before mutation. `--force --yes` approves each edit; `--yes` alone preserves it. Replace or remove only the approved leaf, never recurse or follow links. On completed file actions or ownership release, publish the updated sorted manifest snapshot atomically; retain a prior record for a preserved still-shipped edit and omit a preserved obsolete path.

Expected outcome:

- Deliberate preservation is successful, and a prompt failure prevents all selected mutation. Created or replaced files retain staged executable status.

Validation:

- Run `sh -n`, direct focused tests, and `./bin/cr test <changed-lib-paths>`.

## References

- [Installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- Ticket `0005-install-new-harness-payloads-safely`
- `lib/commands/install.sh`, `lib/commands/install/`, `tests/commands/install.test.sh`
