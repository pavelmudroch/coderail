---
id: "0017"
slug: "publish-fresh-main-tip-canary-distributions"
title: "Publish fresh main-tip canary distributions"
status: "closed"
created_at: "2026-11-05T08:56:01.477Z"
updated_at: "2026-11-05T09:54:54.709Z"
dependencies:
  - "0015"
  - "0016"
reason: "done"
---

# Publish fresh main-tip canary distributions

Automatically publish the pushed main tip as the dedicated `canary` prerelease using six checked packages, while preventing older jobs from replacing newer canaries. Depends on 0015 for packaging and 0016 for the workflow ignore policy and publication mechanics; extend shared helpers only as needed rather than duplicating packaging or release checks.

## Tasks

1. [x] Specify canary identity, freshness, and failure behavior with tests
2. [x] Implement automatic main-tip builds and serialized fresh publication
3. [x] Validate canary consumption and document operating limits

## Task details

### 1. Specify canary identity, freshness, and failure behavior with tests

Scope: add offline workflow/publication tests with fake remote branch/release state and complete or failing package sets. Reuse stable publication fixtures/checks from 0016 where useful.

Expected outcome:

- A push of multiple commits builds the resulting main tip, not every intermediate commit. Package version is `canary`; full source SHA and target match executable source, metadata, and release target_commitish.
- All six builds and package checks must pass before public prerelease creation/replacement; failing application tests do not block canary publication.
- Model out-of-order build completion and pushes while publication is pending. An older job cannot replace a canary already published by a newer job; canceled/superseded jobs cannot later upload stale assets. Use a serialized publication boundary and authoritative freshness checks, not a start-time-only branch check.
- Canary is `draft:false`, `prerelease:true`, with full source SHA as target_commitish. Successful replacement of the dedicated rolling canary is distinct from retrying a partially failed release: no retry/resume interface, automatic failure cleanup, or rollback is added.
- Build/check failures do not replace the prior canary. Upload failures may leave a public incomplete canary and report partial state; upgrade rejects missing/changing assets before installation mutation.

Validation: deterministic interleaving tests cover an older job finishing last and a main advance during publication, plus missing/checksum-invalid artifacts and upload failures. Tests require no GitHub mutations. Run applicable per-file `cr verify` after implementation.

### 2. Implement automatic main-tip builds and serialized fresh publication

Scope: add `.github/workflows/canary.yml`; reuse `tools/package.ts`, compiler pin, artifact checks, and any private publication helper from the stable workflow. Keep freshness orchestration specific to this workflow where practical.

Expected outcome:

- Trigger automatically for main pushes and compile the exact event tip into all six target packages with `--version canary` and the full SHA.
- Collect/check all six archive/sidecar pairs before public publication, including matching-platform smoke coverage consistent with 0016. No application-test gate or manual publication approval.
- Serialize publication and verify authoritative main freshness at the publication boundary; coordinate rolling canary tag/release replacement and uploads so a superseded job cannot overwrite newer publication state.
- Keep the dedicated canary prerelease consumable by the existing resolver. Use direct public creation and subsequent uploads. Apply no-draft and manual-failure recovery policy; no automatic cleanup of a partially published release or resumption of failed uploads.

Validation: task 1 race/failure checks pass and workflow dependency inspection confirms all six checked packages are required. Validate syntax with available tooling. Explain in implementation review how publication coordination prevents stale overwrite even though cancellation alone cannot make an API call atomic. Do not publish a canary from the current checkout.

### 3. Validate canary consumption and document operating limits

Scope: extend shared package/publication integration coverage only where needed and update maintainer guidance.

Expected outcome: stage real canary package outputs through the existing consumer with fake transport, verify full commit identity and first-install/subsequent-upgrade behavior, and retain refusal of missing/changing assets without fallback/retry. Document automatic main-tip publication, freshness semantics, manual recovery after partial upload, and accepted risk of functionally broken canaries. Distinguish required compilation/package checks from the absence of an application-test gate.

Validation: verify two distinct canary source SHAs remain distinguishable through metadata and existing executable activation naming; exercise optional-resource packages. Run required per-file `cr verify` for changed source/tests and shared publication checks. Keep all repository/API mutations in disposable fixtures.

## References

- [Ship plan: publishing and structure](../../plans/ship-tool-and-release-publishing/IDEA.md)
- [Upgrade idea: canary publishing](../../plans/upgrade-command/IDEA.md#canary-and-publishing)
- [Release resolver and staging](../../../src/commands/upgrade/distribution.ts)
- [Executable activation](../../../src/commands/upgrade/activation.ts)
- Dependencies: [0015 packaging](0015-compile-and-package-upgrade-compatible-release-distributions.md), [0016 stable publication mechanics](0016-publish-stable-releases-from-version-tags.md).

## Implementation review

- Main pushes build only `github.sha`, with the shared six-target package and native smoke tools. Canary smoke accepts rolling metadata while retaining the source executable version check.
- Publication alone holds `canary-publication` with `cancel-in-progress: false`. Every mutation and the final completion check read authoritative main inside that boundary. Pending jobs can be canceled before starting; active jobs are never canceled by newer pushes. A branch advance cannot make an in-flight request atomic, but the next publisher waits for that request and the old job to finish. An older job acquiring the boundary later fails freshness before changing remote state.
- Shared private publication helpers provide package-set checks, authenticated requests, and twelve-asset uploads for stable and canary publishers. The rolling canary explicitly replaces a different source; the same source release is refused rather than resumed. Errors retain remote state for manual inspection.
- README documents publication checks, absence of application-test gating, temporary stale/partial publication, and manual recovery limits.

## Validation results

- `cr verify ./tests/tools/canary.test.ts`: six offline tests pass, including delayed old completion, all fifteen mutation boundaries, and a newer publisher waiting for an in-flight old upload.
- `CODERAIL_PACKAGE_ACCEPTANCE=1 cr verify ./tests/tools/package-real.test.ts`: both acceptance tests pass. Real archives compile/stage for all six targets; native Linux checks run the executable, resource lookup, first install and upgrade. Two distinct canary SHAs retain metadata and activation identity; packages without optional resources support fresh install and upgrade. Other native platforms remain required CI matrix checks.
- `deno test -A tests/tools/release.test.ts tests/commands/upgrade/distribution.test.ts`: sixteen tests pass, including stable-publication regression checks and refusal of missing/changing/corrupt assets before installation mutation.
- Canary YAML parsed with available PyYAML; matrix and dependency/concurrency structure checked offline. Workflow contract tests verify event-tip checkouts, compiler pin, all six targets, and absence of an application-test/approval gate.
- Changed-file `cr verify -s` and `git diff --check` pass. No GitHub mutations or publication were performed.
