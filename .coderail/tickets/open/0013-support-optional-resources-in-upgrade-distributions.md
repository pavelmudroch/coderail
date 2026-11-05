---
id: "0013"
slug: "support-optional-resources-in-upgrade-distributions"
title: "Support optional resources in upgrade distributions"
status: "open"
created_at: "2026-11-05T08:55:55.349Z"
updated_at: "2026-11-05T08:55:55.349Z"
dependencies: []
---

# Support optional resources in upgrade distributions

Allow either resource directory to be absent or empty so the existing upgrade consumer can install the agreed release format without placeholder templates. Retain the exported distribution and asset interfaces and all existing safety and ownership rules.

## Tasks

1. [ ] Cover optional-resource staging and reconciliation behavior
2. [ ] Accept absent and empty resource directories through upgrade

## Task details

### 1. Cover optional-resource staging and reconciliation behavior

Scope: extend `tests/commands/upgrade/distribution.test.ts` and `tests/commands/upgrade/assets.test.ts`, using the existing release fixture where useful. Add command integration coverage in the existing upgrade command tests only where helper tests cannot establish preflight ordering.

Expected outcome:

- Test missing and empty `instructions/` and `templates/` independently and together, including explicit empty ZIP directory entries and omitted entries.
- Establish an empty incoming resource set through staging and asset planning, including missing staged directories passed directly to the planner.
- Verify first installation and subsequent reconciliation: unrelated user-created files survive; unchanged obsolete managed resources are removed; modified managed resources retain the existing force/confirmation policy and declined-action baseline.
- Continue rejecting files or symlinks in place of resource roots, unsafe paths, links, special files, and empty resource files. Missing or changing release assets still fail before installation mutation.

Validation: tests distinguish permitted absence from invalid entry types and assert manifest changes and preserved files, rather than only successful return values. Run the applicable per-file `cr verify` for modified tests after implementation.

### 2. Accept absent and empty resource directories through upgrade

Scope: amend `src/commands/upgrade/distribution.ts` archive validation/staging and `src/commands/upgrade/assets.ts` resource enumeration. Update their contract comments. Do not change exported interfaces or add resource placeholders.

Expected outcome: optional roots represent empty incoming sets throughout staging and reconciliation. Preserve regular-file/content/path validation when resources exist and distinguish missing paths from other filesystem errors. Keep cleanup, manifest ownership, confirmation, and preflight-before-mutation behavior intact.

Validation: task 1 passes alongside existing distribution and asset checks. Run `cr verify ./src/commands/upgrade/distribution.ts`, `cr verify ./src/commands/upgrade/assets.ts`, and the applicable `cr verify ./tests/<path>.test.ts` for each modified test; fix failures and repeat until passing.

## References

- [Ship plan: optional resources](../../plans/ship-tool-and-release-publishing/IDEA.md#agreed-optional-resources)
- [Upgrade consumption contract](../../plans/upgrade-command/IDEA.md#agreed-release-consumption-contract)
- [Distribution consumer](../../../src/commands/upgrade/distribution.ts)
- [Asset reconciliation](../../../src/commands/upgrade/assets.ts)
- [Distribution tests](../../../tests/commands/upgrade/distribution.test.ts)
- [Asset tests](../../../tests/commands/upgrade/assets.test.ts)
- [Shared release fixture](../../../tests/commands/upgrade/release-fixture.ts)
- Related completed tickets: 0001 (distribution staging), 0003 (asset ownership).
- Consumer of this amendment: [0015 packaging](0015-compile-and-package-upgrade-compatible-release-distributions.md).
