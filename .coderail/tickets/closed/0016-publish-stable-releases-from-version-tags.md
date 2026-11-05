---
id: "0016"
slug: "publish-stable-releases-from-version-tags"
title: "Publish stable releases from version tags"
status: "closed"
created_at: "2026-11-05T08:56:01.198Z"
updated_at: "2026-11-05T09:46:00.846Z"
dependencies:
  - "0014"
  - "0015"
reason: "done"
---

# Publish stable releases from version tags

Build the exact pushed `vX.Y.Z` revision and publish its six checked distributions to a public stable GitHub Release. Depends on 0014 for the ship/version/changelog contract and 0015 for shared packaging. Publication never waits for application-test success and uses no drafts or manual approval gate.

## Tasks

1. [x] Specify stable publication gates and failure behavior with fixtures
2. [x] Add the six-target stable release workflow
3. [x] Publish checked assets and document manual recovery

## Task details

### 1. Specify stable publication gates and failure behavior with fixtures

Scope: add offline workflow/publication checks using fixture artifacts and a fake GitHub API or command transport. Private publisher helpers, if needed, are implementation-defined and should be reusable by 0017. Keep tests focused on release behavior rather than mirroring YAML.

Expected outcome:

- Match version tag, source constant, tagged changelog notes, executable version, archive metadata, and full source commit. Resolve annotated or lightweight tags to the exact commit.
- A failed/missing build, any missing archive/sidecar, or a package validation error prevents public release creation. All six archives and six sidecars must be collected and checked first.
- Release creation specifies repository `pavelmudroch/coderail`, `vX.Y.Z`, full source SHA as `target_commitish`, `draft:false`, `prerelease:false`, and notes from that revision's versioned changelog section.
- Upload follows public creation. Creation/upload failures report the failed step and partial state, without automatic rollback, cleanup, overwrite, tag movement, or resume interface. An existing release is a failure rather than a request to replace assets.
- Existing upgrade behavior refuses incomplete/changing release assets before installation mutation, without fallback to an older release or automatic retry.
- No application-test result, draft stage, or manual publication approval is a release prerequisite.

Validation: fixture-driven checks show zero creation calls on prepublication failures and preserve the public partial release on simulated upload failure. Run applicable per-file `cr verify` for any modified source/tests after implementation; use no real release API mutations.

### 2. Add the six-target stable release workflow

Scope: add `.github/workflows/release.yml` and adjust `.gitignore` so workflows are trackable despite its dot-directory ignore policy. Use `tools/package.ts` from 0015 for every target; pin a compatible Deno compiler consistently. Runner allocation remains implementation-defined.

Expected outcome:

- Trigger on pushed canonical `vX.Y.Z` stable tags and reject malformed identities before publication.
- Check out the exact tag commit; package all six agreed target triples with the matching version and full SHA.
- Collect outputs, then require all six archive/sidecar pairs to pass package checks before the publication job. Include matching-platform executable/resource smoke coverage and disposable first-install/subsequent-upgrade checks, accounting explicitly for Windows ARM64 runner availability.
- Set only necessary workflow permissions for artifact handling and release writes. Application tests remain the maintainer's responsibility; no test workflow dependency is introduced.

Validation: inspect the job dependency graph and exercise workflow checks against complete, missing, failed, and mismatched package sets. Verify checks use real package artifacts and current consumer compatibility. Confirm both workflow files can be tracked under the chosen ignore policy. Do not push tags or trigger a real release as a test.

### 3. Publish checked assets and document manual recovery

Scope: implement the publication step and any private shared helper; update maintainer documentation with the ship-to-CI handoff, local validation, and recovery expectations.

Expected outcome: after all checks, create a public stable release directly and upload exactly the six archives plus six checksum sidecars. Extract notes from the tagged changelog, never generated commits or moving main. Preserve exact target_commitish identity. Document transient/failed missing assets, already-finalized changelog, and manual resolution followed by a fresh normal ship with clean main equal to or ahead of fetched origin/main, unused tag, and applicable changelog entries. Do not implement a recovery state machine or automated release cleanup.

Validation: task 1 checks pass; offline publication checks establish operation ordering and failure reporting. Review the full path from ship-generated tag to checked artifacts and consumer refusal of partial releases. Run required per-file `cr verify` for source/test changes and validate workflow syntax with available tooling. No actual publication is authorized by this ticket-generation work.

## References

- [Ship plan: publication and recovery](../../plans/ship-tool-and-release-publishing/IDEA.md#agreed-publication-and-recovery)
- [Ship plan: validation responsibility](../../plans/ship-tool-and-release-publishing/IDEA.md#agreed-validation-responsibility)
- [Ignore policy](../../../.gitignore)
- [Changelog](../../../CHANGELOG.md)
- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases)
- Dependencies: [0014 ship CLI](0014-add-maintainer-ship-cli-for-versioned-releases.md), [0015 packaging](0015-compile-and-package-upgrade-compatible-release-distributions.md).
- Shared publication consumer: [0017 canary workflow](0017-publish-fresh-main-tip-canary-distributions.md).

## Implementation validation

- Added stable tag workflow with identity -> six native build/smoke jobs -> collected package check -> publication dependencies. Every job uses Deno 2.9.8; only publication has contents write permission. Native runners cover Linux/macOS/Windows x86_64 and ARM64, including windows-11-arm; runner unavailability blocks publication.
- Four offline publication contracts pass via `cr verify ./tests/tools/release.test.ts`: annotated/lightweight identity, tagged notes, all twelve assets, missing/corrupt/mismatched packages, existing releases, creation failures, and retained public state after two successful uploads followed by a failed upload. No cleanup, replacement, retry, or real API mutation occurs in these checks.
- Built all six real compiler outputs in a disposable committed source snapshot with an annotated version tag. `tools/release.ts check` accepted the complete archive/sidecar collection through the current upgrade consumer. Linux x86_64 native smoke passed executable version, initialization, first installation, actual resource reads through compiled production runtime context, installed resource equality, and subsequent upgrade using a real canary archive. Other five runtimes require their matching CI hosts; they cannot run on this Linux x86_64 workstation.
- Existing upgrade partial-publication refusal test passes (missing/changing assets rejected before prompts or installation mutation); consumer behavior was unchanged.
- actionlint 1.7.12 validates workflow syntax and current runner labels. Inspected success-only dependencies, six-target matrix, compiler pins, lack of application-suite/manual/draft gates, and both release.yml/canary.yml ignore exceptions.
- `deno check tools/release.ts tools/smoke-package.ts`, `git diff --check`, and final `cr verify -s` over only this implementation's six changed files pass (Markdown/YAML/ignore files have no configured verification rules).
- Maintainer documentation covers exact ship-to-CI handoff, offline local checks, transient/failed missing assets, finalized changelog history, and manual resolution followed by a fresh normal ship. Existing staged changes were preserved. No tag pushes, real workflow triggers, or release publication were performed.
