---
id: "0006"
slug: "integrate-upgrade-cli-and-end-to-end-reconciliation"
title: "Integrate upgrade CLI and end-to-end reconciliation"
status: "open"
created_at: "2026-11-03T13:10:59.754Z"
updated_at: "2026-11-03T13:10:59.754Z"
dependencies:
  - "0002"
  - "0003"
  - "0004"
  - "0005"
---

# Integrate upgrade CLI and end-to-end reconciliation

Make `cr upgrade` complete bootstrap or upgrade a distribution using verified releases, protected assets, stable launchers, and bounded cleanup. Depends on tickets 0002–0005; verified release support arrives transitively through 0003/0004.

## Tasks

1. [ ] Add upgrade argument and end-to-end lifecycle tests
2. [ ] Implement upgrade argument parsing and help
3. [ ] Wire the upgrade lifecycle and recovery reporting

## Task details

### 1. Add upgrade argument and end-to-end lifecycle tests

Scope: add `tests/commands/upgrade.test.ts` and focused integration fixtures using the preceding tickets' helpers. Use temporary roots, fake releases, deterministic prompts, and injected failure points; never modify the developer installation or require deployed publishing workflows.

Expected outcome: specify help/no-side-effect behavior, invalid arguments, latest/partial/exact selectors with optional `v`, canary/version exclusion, downgrades, same-version restoration, force policies, initial bootstrap and custom roots outside initialized projects.

Validation: verify all downloads, extraction, validation, and confirmations precede installed-file changes; stale cleanup begins mutation, then asset writes/removals and manifest save precede activation, then retirement occurs. Cover user templates, declined actions/baselines, asset/manifest/activation failures, concurrent upgrades, Unix launchers, Windows forwarding/deferred cleanup, and residual cleanup reporting. Distinguish native platform checks from fixture-only coverage.

### 2. Implement upgrade argument parsing and help

Scope: implement parsing/help in `src/commands/upgrade.ts`, preserving `requiresInit = false` and the established command interface.

Expected outcome: support `-h/--help`, `--version`, `--canary`, `-f/--force`, `-y/--yes`, and `-n/--no`. Reject malformed/missing selectors, unexpected positional/unknown options, mutually exclusive canary/version, yes/no without force, and yes/no together. Document `vX`, `vX.Y`, and `vX.Y.Z` alongside unprefixed selectors and latest. Help and invalid invocations never resolve/download a release or mutate files.

Validation: task 1 argument tests pass and help accurately describes confirmation behavior and defaults.

### 3. Wire the upgrade lifecycle and recovery reporting

Scope: orchestrate helpers in `src/commands/upgrade.ts`; keep module-specific logic in preceding tickets. Integrate existing abort/cleanup behavior and preserve the selected physical root from ticket 0002.

Expected outcome: resolve/download/verify into staging, coordinate installed-state inspection and all confirmations, clean stale binaries, apply assets and persist their actual ownership state, activate, then retire. Complete bootstrap from a physical `libexec` executable without a manifest or launcher. Reconcile already-current versions instead of returning early. Noninteractive conflicts require yes/no during preflight. Report selected build, completed/declined actions, activation, and residual binaries truthfully.

Validation: task 1 lifecycle tests pass. Mutation failures report partial progress and root-specific manual removal/rebootstrap guidance using `curl` and `install.sh`, warning that removing the root also removes user templates and advising preservation first. Preflight errors remain distinguishable from partial mutations. Keep automatic rollback, publishing workflows, bootstrap implementation, PATH changes, and harness install/uninstall feature changes out of scope. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for changed source/test files and affected integration suites.

## References

- [Complete upgrade requirements and verification expectations](../../plans/upgrade-command/IDEA.md)
- [Upgrade command](../../../src/commands/upgrade.ts)
- [Command dispatch](../../../src/main.ts)
- [Runtime cleanup](../../../src/runtime/cleanup.ts)
- [Existing install policy](../../../src/commands/install.ts)
- [Existing uninstall policy](../../../src/commands/uninstall.ts)
- Prerequisites: 0002, 0003, 0004, 0005. Release contract: 0001.
