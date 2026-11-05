---
id: "0014"
slug: "add-maintainer-ship-cli-for-versioned-releases"
title: "Add maintainer ship CLI for versioned releases"
status: "closed"
created_at: "2026-11-05T08:55:55.531Z"
updated_at: "2026-11-05T09:15:46.165Z"
dependencies: []
reason: "done"
---

# Add maintainer ship CLI for versioned releases

Provide `deno run -A tools/ship.ts <major|minor|patch> [--dry]` to prepare the version and changelog, then commit, tag, and atomically push a stable release. Ship ends after the push; GitHub Actions owns compilation and publication.

## Tasks

1. [x] Specify CLI, version, and changelog preparation with tests
2. [x] Specify Git preflight, dry preparation, and push failures in disposable repositories
3. [x] Implement argument parsing and version/changelog preparation
4. [x] Implement safe Git orchestration and maintainer guidance

## Task details

### 1. Specify CLI, version, and changelog preparation with tests

Scope: add focused tests under `tests/tools/` for the ship entrypoint and private preparation seams as needed. Use temporary fixtures, not the checkout's release inputs.

Expected outcome:

- Require exactly one major/minor/patch argument and accept optional `--dry`; reject missing/repeated/extra bump arguments, unknown flags, `--version`, and `--force`.
- Verify semver carry/reset behavior (including 0.1.0 to 1.0.0, 0.2.0, or 0.1.1) and invalid current versions.
- If a section already exists for the computed version, preserve the entire changelog byte-for-byte, including date and links, even with empty Unreleased; version preparation still occurs. Cover dry and normal invocation.
- Otherwise reject empty Unreleased, whitespace, or category headings without entries before release mutation. Preserve actual entries when moving them below a fresh empty Unreleased into `## [X.Y.Z] - YYYY-MM-DD`.
- Cover first-release tag-page links and subsequent comparison links, the new Unreleased comparison to HEAD, and preservation of historical entries/reference links.
- Verify `--help` succeeds on stdout with no other arguments outside a checkout and without network, Git calls, or file mutation; help explains bump selection and unstaged dry edits with no commit/tag/push.

Validation: assertions cover exact file contents and failure side effects; tests use a controlled date where necessary. Run applicable per-file `cr verify` after implementation.

### 2. Specify Git preflight, dry preparation, and push failures in disposable repositories

Scope: add integration tests using disposable working repositories and bare origins. Never fetch or push the real repository remote.

Expected outcome:

- Reject branches other than main, dirty tracked files/index, untracked release inputs, unsynchronized or diverged main, fetch failures, and existing target tags locally or remotely before release edits.
- Verify origin is fetched before equality with origin/main is established; do not merge, rebase, or push unrelated commits.
- Successful normal invocation edits only release inputs, creates the release commit and `vX.Y.Z` tag, then pushes origin/main and the tag together atomically without force.
- Simulate concurrent remote changes, remote tag collisions, unsupported atomic push, and rejected pushes. No separate-push fallback or ref overwrite is permitted. Failures retain any already-created local files/commit/tag and report the failed step and partial state.
- Dry mode performs the same preflight, including fetch, and writes the same preparation edits unstaged. Index, commits, tags, and remote refs stay unchanged; a later invocation rejects the dirty checkout. Existing-version changelog handling works in both modes.

Validation: compare local and remote refs, index state, and release file contents before/after each scenario. Verify no compilation, packaging, application tests, or publication are invoked.

### 3. Implement argument parsing and version/changelog preparation

Scope: create `tools/ship.ts`; keep private helper boundaries implementation-defined. Read/update `src/cli/version.ts` and `CHANGELOG.md` only as release inputs at runtime. Do not bump this checkout during implementation.

Expected outcome: implement task 1 semantics with deterministic validation before release mutation; choose a consistent release-date timezone. Expose no application API and no version override or force option. Existing target-version changelog sections skip only changelog rewriting and the nonempty-Unreleased condition, not other ship steps.

Validation: task 1 passes. Help works from outside Git with network unavailable. Any source/test files modified during implementation receive their required per-file `cr verify` checks.

### 4. Implement safe Git orchestration and maintainer guidance

Scope: finish orchestration in `tools/ship.ts` and document usage in repository maintainer documentation.

Expected outcome: apply task 2 preconditions and atomic push behavior; normal mode commits finalized release inputs and tags that commit. Dry mode stops after unstaged preparation. Stop on errors and report partial state for manual inspection without rollback, cleanup, retry/resume, or tag movement. Explain that maintainers run application tests before ship, CI does not gate publication on application tests, and dry edits must be reset before repeating the original release through normal ship. An empty initial changelog blocks shipping until entries are authored; never generate entries from commits.

Validation: disposable Git integration tests pass, including remote races and retained partial local state. Check documented invocations against help. Run per-file `cr verify` for every modified source/test file and fix failures. Do not execute a real release or invoke ship against the current checkout.

## References

- [Ship plan and verification expectations](../../plans/ship-tool-and-release-publishing/IDEA.md)
- [Current version](../../../src/cli/version.ts)
- [Changelog](../../../CHANGELOG.md)
- [Repository verification instructions](../../../AGENTS.md)
- Publication handoff: [0016 stable workflow](0016-publish-stable-releases-from-version-tags.md).
