---
id: "0008"
slug: "centralize-upgrade-argument-validation-and-align-diagnostics"
title: "Centralize upgrade argument validation and align diagnostics"
status: "closed"
created_at: "2026-11-04T09:46:26.279Z"
updated_at: "2026-11-04T09:54:49.138Z"
dependencies:
  - "0007"
reason: "done"
---

# Centralize upgrade argument validation and align diagnostics

Give invalid upgrade invocations the same diagnostics and parsing conventions as other commands, and make the parser the sole owner of CLI option validation. Depends on 0007 to avoid overlapping edits to `upgrade.ts` and its tests.

## Tasks

1. [x] Specify parser diagnostics and adjust helper validation tests
2. [x] Align upgrade option parsing and usage errors
3. [x] Remove duplicate CLI validation from upgrade helpers

## Task details

### 1. Specify parser diagnostics and adjust helper validation tests

Scope: extend `tests/commands/upgrade.test.ts` and update CLI-validation cases in `tests/commands/upgrade/assets.test.ts` and `tests/commands/upgrade/distribution.test.ts`.

Expected outcome: replace generic throw-only argument checks with expected diagnostic assertions. Cover unknown options; boolean `--help=`, `--canary=`, `--force=`, `--yes=`, and `--no=` forms; both flag orders for incompatible pairs; yes/no without force; unsupported positionals; missing, empty, option-like, and malformed version values. Move invalid-selector and option-combination coverage from helpers to the parser. Preserve helper coverage of missing confirmation callbacks and invalid runtime release/package state.

Validation: valid latest/default, numeric major/minor/patch selectors with optional `v`, canary, and force aliases still parse. Early help returns without later argument validation as existing commands do. Help and rejected invocations never resolve/download releases or mutate installed files. Tests distinguish a missing value from an invalid supplied selector.

### 2. Align upgrade option parsing and usage errors

Scope: `Upgrade.parseArguments()` in `src/commands/upgrade.ts`; use install/uninstall handling and existing value-taking options in `ticket/create.ts` and `cr.ts` as references.

Expected outcome: emit `Unknown option "...".`, `Option "..." does not take a value.`, `Options "..." and "..." cannot be used together.`, and `Options "--yes" and "--no" require "--force".` Use `Option "--version" requires a value.` for missing values and a quoted-option diagnostic explaining valid selectors for invalid values. Follow value-taking conventions for separated and `--version=<selector>` forms, updating the existing equals-form rejection test. Preserve selector syntax constraints, early help, and positional rejection.

Validation: task 1 parser cases pass, including zero versus leading-zero selectors, prerelease rejection, and canary/version exclusion.

### 3. Remove duplicate CLI validation from upgrade helpers

Scope: remove the yes/no/force combination check in `planAssets()` (`src/commands/upgrade/assets.ts`) and canary/version exclusivity plus selector syntax checks in `resolveRelease()` (`src/commands/upgrade/distribution.ts`). The latter is explicitly in scope despite being outside the original staged diff.

Expected outcome: helpers consume validated options. Retain asset conflict and prompt-availability checks, supported-target validation, release/archive/build checks, ownership validation, and filesystem safety. Keep release-tag filtering: validating published data is separate from validating CLI selectors.

Validation: updated helper suites continue covering valid selection and runtime failures. For every modified source file run `cr verify ./src/<path-to-file>.ts`; for every modified test file run `cr verify ./tests/<path-to-file>.test.ts`, fixing failures until all pass.

## References

- [Agreed review changes](../../plans/upgrade-command/REVIEW.md), second and third items
- [Upgrade selection and conflict contract](../../plans/upgrade-command/IDEA.md)
- [Upgrade parser](../../../src/commands/upgrade.ts)
- [Install parser](../../../src/commands/install.ts) and [uninstall parser](../../../src/commands/uninstall.ts)
- [Value-taking ticket options](../../../src/commands/ticket/create.ts) and [root command options](../../../src/commands/cr.ts)
- [Asset planner](../../../src/commands/upgrade/assets.ts) and [release resolver](../../../src/commands/upgrade/distribution.ts)
- Prerequisite: [0007 help formatting](0007-wrap-upgrade-help-to-match-command-conventions.md)
