---
id: "0003"
slug: "reconcile-upgrade-assets-with-distribution-ownership"
title: "Reconcile upgrade assets with distribution ownership"
status: "closed"
created_at: "2026-11-03T13:10:59.115Z"
updated_at: "2026-11-04T08:57:52.670Z"
dependencies:
  - "0001"
reason: "done"
---

# Reconcile upgrade assets with distribution ownership

Apply verified release assets while preserving unrelated user templates and honoring per-file conflict decisions. Maintain a separate distribution manifest describing actual managed files. Depends on ticket 0001's staged-package contract.

## Tasks

1. [x] Add manifest, preflight, and reconciliation tests
2. [x] Implement distribution ownership and conflict planning
3. [x] Apply approved asset actions and persist actual manifest state

## Task details

### 1. Add manifest, preflight, and reconciliation tests

Scope: add focused tests under `tests/commands/upgrade/` using temporary installations and ticket 0001's package fixtures.

Expected outcome: specify fresh bootstrap, same-version restoration, changed/unchanged/missing tracked files, obsolete managed files, untracked template collisions, unrelated templates, malformed manifests, unsafe installed paths, and all force/confirmation outcomes.

Validation: prove all validation and prompts finish before mutation. Cover noninteractive prompts without automatic answers, declined overwrites/removals, retained baselines, partial write/removal/save failures, and no blanket template-directory deletion.

### 2. Implement distribution ownership and conflict planning

Scope: add distribution-specific manifest and asset-planning helpers under `src/commands/upgrade/`; reuse checksum/inspection primitives where appropriate without changing harness ownership scope. Choose/document a manifest filename/schema at the stable root and expose executable ownership/coordination integration points for tickets 0004/0005.

Expected outcome: recognize bootstrap's running executable without treating it as an untracked conflict. Validate destination containment and existing links before mutation. Unchanged tracked files may be replaced/removed and missing ones restored. Locally modified tracked files and incoming untracked destinations fail preflight without force. With force, resolve every conflicting action individually; yes/no supplies automatic decisions. A required prompt without an interactive terminal fails during preflight. Unrelated untracked files remain untouched.

Validation: task 1 planning tests pass; manifest corruption, conflicts, and unresolved prompts cause zero installed-file changes.

### 3. Apply approved asset actions and persist actual manifest state

Scope: implement the asset mutation phase and progress/error reporting, leaving executable activation to ticket 0004 and command recovery messaging to ticket 0006.

Expected outcome: apply only approved writes/removals and persist successful results before activation can occur. Preserve prior checksums/sizes for declined tracked actions; declined untracked destinations remain unowned. Remove manifest entries only for completed removals or verified absence. Same-version reconciliation follows identical conflict rules. Expose partial progress on runtime failure; no automatic rollback is required.

Validation: task 1 reconciliation tests pass, including injected failures and manifest-save failures preventing activation. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for changed source/test files.

## References

- [Conflict, manifest, and sequencing requirements](../../plans/upgrade-command/IDEA.md)
- [Manifest primitives](../../../src/install-manifest.ts)
- [Manifest path validation](../../../src/install-manifest/validate.ts)
- [Install conflict planning](../../../src/commands/install.ts)
- [Uninstall declined-action persistence](../../../src/commands/uninstall.ts)
- [Confirmation helper](../../../src/log/confirm.ts)
- Prerequisite: 0001. Activation/cleanup consumers: 0004 and 0005. Integration: 0006.
