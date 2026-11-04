---
title: "Ship tool and release publishing"
status: "ready"
---

## Intended outcome

Provide a maintainer ship tool accepting a major, minor, or patch version bump; update `CODERAIL_VERSION` in `src/cli/version.ts`; define changelog handling; create and push a version tag; and publish GitHub Releases containing six compiled distributions consumable by the existing `cr upgrade` command.

This is exploration, not authorization to release the current checkout. No source implementation or actual release is part of this exploration.

## Established requirements and context

- Current version is `0.1.0`; semver bumps would produce `1.0.0`, `0.2.0`, or `0.1.1`, respectively.
- `CHANGELOG.md` uses Keep a Changelog with an empty `[Unreleased]` section and no released versions yet. The first ship requires authored entries before it can proceed.
- No GitHub Actions workflows currently exist. `.gitignore` ignores dot directories, so adding tracked `.github/workflows` requires adjusting the ignore policy or explicitly adding those files.
- Existing upgrade design: [Upgrade command](../upgrade-command/IDEA.md). That design already requires stable tag builds and automatic canaries following pushed `main` tips. Canary publication requires successful compilation/packaging but is not blocked by failing tests; older jobs must not replace newer canaries.
- Existing consumer contract is implemented in `src/commands/upgrade/distribution.ts`; publisher output must be tested against that consumer rather than invent a second format.
- Entrypoint is `src/main.ts`. Compiled runtime resource lookup expects resources outside the executable at the flattened installation root (`src/runtime/context.ts`).
- `assets/instructions/` contains distribution resources. There are currently no built-in templates. `assets/templates/` is empty and untracked; Git does not preserve empty directories. Existing upgrade requires files under both resource roots and its asset planner assumes both staged directories exist. Both stages must accommodate the agreed optional-resource contract below.
- Deno supports all six requested target triples, including Windows ARM64 starting at 2.9.3. Local Deno is 2.9.8. Pin an appropriate compiler version in CI; native npm dependencies, if present in the actual compiled graph, need per-target validation.

## Required release-consumption contract

- Repository: `pavelmudroch/coderail`.
- Six archives: `coderail-<target>.zip`, for `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`, and `aarch64-pc-windows-msvc`.
- Each archive root contains `cr` (Windows: `cr.exe`) and `build.json`. Both `instructions/` and `templates/` are optional and may be empty. Do not introduce an `assets/` prefix.
- Metadata: `{schemaVersion:1, version:"X.Y.Z"|"canary", commit:"<full lowercase 40-character SHA>", target:"<Deno target>"}`.
- Each archive has a `<archive>.sha256` sidecar containing exactly `<lowercase SHA-256>  <archive name>\n`.
- ZIP format must match the existing strict reader: classic single-disk ZIP, stored/deflated entries, no data descriptors, ZIP64, links, archive comments, or unsupported paths. Resource files must be nonempty. Merely selecting an arbitrary ZIP utility is insufficient without compatibility validation.
- Stable tags may be consumed with or without `v`; publisher spelling is consistently `vX.Y.Z`. Stable release is not a prerelease. Dedicated `canary` release is a prerelease.
- GitHub release `target_commitish` must be the exact full source SHA, matching metadata, rather than a branch name. All six archives and sidecars must be built and checked before creating the public release. Uploads follow release creation; the no-draft policy below supersedes the previous assumption that all assets are attached before visibility.

## Agreed ship responsibility

- Ship is a repository maintainer tool. Its responsibility is limited to version bump, changelog update, commit, tag, and push to GitHub.
- GitHub Actions owns compilation, distribution packaging, and GitHub Release publication. Ship does not perform these tasks locally or wait for them to finish.
- Proposed invocation: `deno run -A tools/ship.ts major|minor|patch`; exact invocation remains an implementation choice within the repository-tool boundary.

## Agreed Git preconditions

- Ship only from `main`, with a clean working tree and index, including no untracked release inputs.
- Fetch `origin` and require local `main` to match `origin/main` before preparing the release. Do not implicitly merge, rebase, or push unrelated local commits.
- Create the release commit and `vX.Y.Z` tag, then push that commit to `origin/main` and the tag to `origin` together atomically. No force push or fallback to separate non-atomic pushes.
- Reject an existing target tag locally or remotely before mutation. A concurrent remote change must cause a rejected push rather than overwrite it.

## Agreed changelog behavior

- Require actual release entries under `[Unreleased]`; an empty section blocks shipping before any release mutation. Empty category headings or whitespace alone are not entries.
- Move those entries into a new `## [X.Y.Z] - YYYY-MM-DD` section for the bumped version, preserving their content, and retain a fresh empty `## [Unreleased]` section above it.
- Update reference links at the end of the changelog to point to version tags and comparisons. `[Unreleased]` compares the new `vX.Y.Z` tag to `HEAD`; a version with a preceding release links to the comparison between their tags. For the first recorded release, use its tag page because no preceding release is recorded.
- Example after a first patch release: `[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v0.1.1...HEAD` and `[0.1.1]: https://github.com/pavelmudroch/coderail/releases/tag/v0.1.1`. A subsequent `0.1.2` entry links to `https://github.com/pavelmudroch/coderail/compare/v0.1.1...v0.1.2`.
- Preserve existing historical entries and reference links. Do not generate release entries from commits.

## Agreed optional resources

- Coderail currently has no built-in templates; adding one is not a prerequisite for shipping, and its availability has no agreed timeline.
- Packaging accepts absent or empty source `assets/templates/` and `assets/instructions/` directories independently. Archives may omit either or both entirely, or contain empty directories. Missing instructions are unlikely in practice but explicitly supported.
- Upgrade accepts either representation as an empty incoming set for that resource, through archive validation, staging, and asset reconciliation.
- When present, resource files retain existing path, regular-file, and content validation. Optional resources do not permit a file or symlink in place of either directory.
- An empty incoming set follows existing reconciliation ownership rules: preserve unrelated user-created files; obsolete managed resources use the existing removal/conflict policy.
- This explicitly supersedes the earlier requirement for nonempty instructions and template contents in the upgrade design. Implement the consumer change alongside release packaging, without placeholder files merely to satisfy validation.

## Agreed publication and recovery

- Ship finalizes the changelog as shipped before committing/tagging/pushing; it does not track subsequent CI publication state or undo changelog entries on failure.
- Use the newly versioned changelog section from the tagged revision as GitHub release notes.
- Build the exact tagged commit and check all six archives and six sidecars before publication. Create a public release directly and upload its assets. Do not use GitHub drafts or require a manual publication approval.
- Recovery is entirely manual, followed by shipping again. No automatic rollback, resume/retry interface, tag movement, asset overwrite, or partial-release cleanup is required. On failure stop and report the failed step and any partial state; retain local files, commit, and tag already created for manual inspection.
- A fresh ship invocation always applies the normal clean/synchronized-main, nonempty-Unreleased, and unused-tag preconditions. It does not reinterpret an existing release as a request to resume it. The maintainer resolves failed local/remote state and prepares entries for the next release as necessary.
- A public release may be visible with missing assets during upload, or remain incomplete after an upload failure. This follows from the chosen no-draft flow: release creation and asset upload are separate GitHub operations. Existing upgrade must continue to fail before installation mutation on missing or changing assets; no fallback to an older release or automatic retry is added.
- Share packaging between stable and canary workflows as an implementation choice. Preserve the earlier canary freshness and six-build requirements; apply the no-draft policy to publication. No recovery state machine is needed for either channel.

## Agreed validation responsibility

- Running application tests before shipping is the maintainer's responsibility.
- Ship does not run application tests or wait for a test workflow. Its responsibility remains version/changelog preparation, commit, tag, and push.
- Stable GitHub publication requires successful compilation of all six targets and passing package checks for every target. Application test results do not gate stable publication.
- Package checks validate the produced distributions and their compatibility with upgrade, including executable architecture, metadata identity, checksums, ZIP layout, and optional resources. These checks are required even though the application test suite is not a release gate.
- Canary retains its already agreed requirement for successful compilation/packaging without passing application tests.

## Readiness and implementation freedom

- No consequential design questions remain. Keep one idea covering the ship tool, CI publisher, and required upgrade compatibility amendment; these share the same version/package contract.
- Leave helper boundaries, commit/tag message wording, release-date timezone, runner allocation, compiler pin, packaging library, and manual recovery guidance wording to implementation. Do not introduce additional release gates or automated recovery machinery.

## Verification expectations

- Exercise semver reset behavior and invalid arguments; verify version, changelog heading, tag, executable version, release metadata, and archive metadata agree.
- Test ship Git behavior in disposable repositories, including dirty state, existing tags, divergent branches, and rejected pushes; never use the real remote for tests.
- Validate real produced packages with the current staging consumer, including all six executable headers, exact checksum formatting, and resource contents.
- Verify missing and empty source/archive instructions and template directories independently and together through packaging, staging, and reconciliation; preserve unrelated user resources, apply existing managed-file removal rules, and reject unsafe resource entries.
- Smoke-test compiled executables and resource lookup on matching platforms, with first-install and subsequent upgrade in disposable installation roots.
- Failed/missing builds or package checks prevent creating the stable release. Upload failures may leave an incomplete public release; verify the workflow reports failure without automatic cleanup, and upgrade refuses missing or changing assets before installation mutation. Canary publication obeys the existing freshness policy and does not require passing application tests.
- Verify stable publication depends on all six builds and package checks, with no application-test gate. Document the maintainer's responsibility to run tests before invoking ship.
- When implementation modifies source/tests, run the applicable per-file `cr verify` required by `AGENTS.md`.

## Technical references

- https://docs.deno.com/runtime/reference/cli/compile/
- https://docs.github.com/en/rest/releases/releases
- https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
