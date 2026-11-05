---
id: "0018"
slug: "promote-complete-stable-releases-without-replacing-newer-defaults"
title: "Promote complete stable releases without replacing newer defaults"
status: "closed"
created_at: "2026-11-05T10:46:53.495Z"
updated_at: "2026-11-05T10:54:42.577Z"
dependencies: []
reason: "done"
---

# Promote complete stable releases without replacing newer defaults

Keep GitHub's designated latest release on a complete, validated stable distribution. Automatically promote a newly published version only if it is newer than the designated latest, or no latest exists. This implements the finalized promotion policy in the staged installer plan, superseding the older unresolved policy note in the ship plan.

## Tasks

1. [x] Specify promotion ordering and failure behavior with offline tests
2. [x] Gate promotion on complete publication and serialize promotion decisions
3. [x] Document default-release selection and manual rollback

## Task details

### 1. Specify promotion ordering and failure behavior with offline tests

Scope: extend `tests/tools/release.test.ts` with fake GitHub responses and complete package fixtures; cover the workflow's serialization boundary without performing remote mutations.

Expected outcome: tests require public stable creation with `make_latest: "false"`; all six archives and six sidecars must upload successfully and the complete remote asset set must validate before any `make_latest: "true"` request. Cover first publication, newer/equal/older versions, optional v normalization, numeric rather than lexical comparison, upload/validation errors, latest lookup errors and promotion errors. Distinguish a missing latest from a failed request or invalid latest identity; unsafe comparisons fail clearly without promotion.

Validation: simulate two publications finishing in reverse version order and assert that rechecking latest inside a serialized decision prevents an older release replacing a newer one. Failures leave the previous latest designation unchanged and report retained public state. Run `cr verify ./tests/tools/release.test.ts` after modifying it.

### 2. Gate promotion on complete publication and serialize promotion decisions

Scope: extend `tools/internal/release.ts`, shared `tools/internal/publication.ts` only as needed, and `.github/workflows/release.yml`. Keep canary prerelease behavior intact. Choose a repository-wide serialization boundary covering latest lookup, comparison and promotion across different version tags; existing per-tag concurrency alone is insufficient.

Expected outcome: create the public release explicitly without latest designation, upload and validate the full remote asset set, then recheck designated latest under serialization and promote only when numerically newer or no latest exists. Older maintenance releases remain available without promotion. No moving latest tag or maintainer promotion flag is introduced. Preserve existing identity/package checks and manual recovery behavior.

Validation: task 1 checks pass; inspect workflow ordering and serialization across tags, including skipped/cancelled/failed runs, so a release cannot bypass validation or promote from a stale comparison. Validate workflow syntax with available tooling and type-check changed publisher helpers. Do not publish a real release for verification.

### 3. Document default-release selection and manual rollback

Scope: update release-maintainer guidance in `README.md`.

Expected outcome: explain complete-upload promotion, maintenance-release nonpromotion, concurrency behavior, retained state after failure, and intentional rollback through GitHub's latest designation. Ship still finalizes the changelog before publication and does not undo it on publication failure.

Validation: compare documentation with the implemented request sequence and offline failure cases; ensure no draft stage, approval gate or moving latest tag is implied.

## References

- [Installer promotion policy](../../plans/stable-release-installer/IDEA.md#agreed-publication-promotion)
- [Ship publication amendments](../../plans/ship-tool-and-release-publishing/IDEA.md#agreed-publication-and-recovery)
- [Stable publisher](../../../tools/internal/release.ts)
- [Publication helper](../../../tools/internal/publication.ts)
- [Stable workflow](../../../.github/workflows/release.yml)
- [Publisher tests](../../../tests/tools/release.test.ts)
- Existing publication: [0016](../closed/0016-publish-stable-releases-from-version-tags.md)
