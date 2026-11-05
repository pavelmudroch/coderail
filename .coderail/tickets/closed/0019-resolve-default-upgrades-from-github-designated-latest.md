---
id: "0019"
slug: "resolve-default-upgrades-from-github-designated-latest"
title: "Resolve default upgrades from GitHub designated latest"
status: "closed"
created_at: "2026-11-05T10:46:53.723Z"
updated_at: "2026-11-05T11:01:07.505Z"
dependencies: []
reason: "done"
---

# Resolve default upgrades from GitHub designated latest

Make no-argument upgrade and `--version latest` select GitHub's designated stable release, even when a numerically higher stable release exists. Preserve partial/exact selectors, canary selection and pinned package verification. This consumer change can be implemented independently of publisher promotion.

## Tasks

1. [x] Specify designated-latest selection and pinning with fixtures
2. [x] Align release resolution and default-upgrade guidance

## Task details

### 1. Specify designated-latest selection and pinning with fixtures

Scope: extend `tests/commands/upgrade/distribution.test.ts` and relevant command cases in `tests/commands/upgrade.test.ts`; adapt `tests/commands/upgrade/release-fixture.ts` only if required.

Expected outcome: prove omitted version and explicit latest resolve `/releases/latest` once and select its valid stable identity even when a higher stable exists. Reject drafts, prereleases, canary, malformed stable tags/identities and missing latest; request failures produce clear errors without fallback or mutation. Preserve numeric highest-match selection across all pages for X/X.Y, optional v prefixes, exact-version downgrades and explicit canary selection.

Validation: a fixture changes the latest designation after resolution; subsequent asset downloads and publication rechecks remain bound to the resolved release rather than silently switching. Existing checksum/build/publication-change protection remains covered. Run per-file `cr verify` for each modified test file.

### 2. Align release resolution and default-upgrade guidance

Scope: update `src/commands/upgrade/distribution.ts`; adjust upgrade help in `src/commands/upgrade.ts` and `README.md` only where needed to describe the changed default. Keep stable-version normalization/comparison reusable for the later listing ticket without introducing a public installation API.

Expected outcome: use GitHub's latest endpoint for omitted/latest selection and retain existing immutable asset and publication verification. Partial selectors still use highest numeric matching stable versions; no latest tag or default-to-highest fallback is added.

Validation: task 1 cases pass; run `cr verify ./src/commands/upgrade/distribution.ts` and per-file verification for any other modified source/tests. Review help and documentation against actual selection behavior.

## References

- [Stable selection agreement](../../plans/upgrade-command/IDEA.md#agreed-stable-version-selection)
- [Installer release selection](../../plans/stable-release-installer/IDEA.md#agreed-release-selection)
- [Distribution consumer](../../../src/commands/upgrade/distribution.ts)
- [Distribution tests](../../../tests/commands/upgrade/distribution.test.ts)
- Related publisher change: [0018](0018-promote-complete-stable-releases-without-replacing-newer-defaults.md)
