---
id: "0021"
slug: "list-available-stable-upgrades-with-latest-and-current-markers"
title: "List available stable upgrades with latest and current markers"
status: "closed"
created_at: "2026-11-05T10:46:59.750Z"
updated_at: "2026-11-05T11:31:34.629Z"
dependencies:
  - "0019"
reason: "done"
---

# List available stable upgrades with latest and current markers

Add `cr upgrade --list` as a read-only operation listing published stable versions in descending numeric order. Depends on 0019 for designated-latest semantics and reusable release normalization.

## Tasks

1. [x] Specify listing output, argument validation and absence of mutation
2. [x] Implement stable listing and expose the CLI operation

## Task details

### 1. Specify listing output, argument validation and absence of mutation

Scope: extend `tests/commands/upgrade/distribution.test.ts` and `tests/commands/upgrade.test.ts`, reusing offline release fixtures.

Expected outcome: cover pagination, descending numeric order, draft/prerelease/canary/malformed-tag exclusion, optional v normalization, empty listings and GitHub failures. Annotate designated latest and the running CLI's stable version independently, or use exactly `(latest, current)` when both match. A canary or unpublished current version adds no synthetic row. Reject `--list` with `--version`, `--canary`, `--force`, `--yes` or `--no`, including aliases and supported value forms; reject values on the boolean listing flag.

Validation: assert exact one-version-per-line output, including `1.5.0`, `1.4.3 (latest, current)`, `1.4.2` for a fixture where designated latest is below the highest release. Assert zero archive downloads, installation mutation and PATH prompts/edits, including error paths. Define clear empty/no-latest diagnostics consistent with 0019 and avoid fabricated markers. Run per-file `cr verify` for modified tests.

### 2. Implement stable listing and expose the CLI operation

Scope: extend `src/commands/upgrade/distribution.ts` for metadata-only stable enumeration and `src/commands/upgrade.ts` for parsing, validation, help and early listing execution; document `--list` in `README.md`.

Expected outcome: list all stable release pages, normalize versions and sort numerically; obtain GitHub's latest designation and current CLI version for markers. Execute listing before installation activation or PATH handling and fetch no archive assets. Preserve no-argument upgrade semantics from 0019. Keep metadata helpers private to the upgrade subsystem rather than adding a public installation interface.

Validation: task 1 checks pass; run `cr verify ./src/commands/upgrade.ts`, `cr verify ./src/commands/upgrade/distribution.ts` and per-file verification for modified tests. Review help for incompatibilities and read-only behavior.

## References

- [Listing contract and example](../../plans/upgrade-command/IDEA.md#agreed-stable-version-selection)
- [Upgrade verification expectations](../../plans/upgrade-command/IDEA.md#verification-expectations)
- [CLI version](../../../src/cli/version.ts)
- [Upgrade command](../../../src/commands/upgrade.ts)
- Dependency: [0019](0019-resolve-default-upgrades-from-github-designated-latest.md)
- PATH integration sharing the command file: [0020](0020-configure-installation-path-after-successful-upgrades.md)
