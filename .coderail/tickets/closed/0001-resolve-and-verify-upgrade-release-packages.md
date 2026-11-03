---
id: "0001"
slug: "resolve-and-verify-upgrade-release-packages"
title: "Resolve and verify upgrade release packages"
status: "closed"
created_at: "2026-11-03T13:10:42.738Z"
updated_at: "2026-11-03T15:53:05.986Z"
dependencies: []
reason: "done"
---

# Resolve and verify upgrade release packages

Provide a verified staged distribution for a selected stable release or current canary without changing the installation. Define the release-consumption contract; publishing workflows and `install.sh` remain deferred.

## Tasks

1. [x] Add fixture-driven release resolution and package validation tests
2. [x] Implement stable and canary release resolution
3. [x] Download, validate, and extract the selected distribution into staging

## Task details

### 1. Add fixture-driven release resolution and package validation tests

Scope: add focused tests under `tests/commands/upgrade/` with fake GitHub responses and ZIP/checksum fixtures; isolate network and filesystem effects.

Expected outcome: tests specify default/latest, major/minor/exact selectors with optional `v`, stable-only selection, explicit downgrades, canary commit identity, and every supported platform.

Validation: cover missing releases/assets/checksums, pagination, unsupported targets, network failures, corrupt archives, mismatched metadata, and changing canary publication data. Assert failures leave installed files untouched; tests never contact live releases or the developer installation.

### 2. Implement stable and canary release resolution

Scope: introduce focused upgrade helpers under `src/commands/upgrade/`; keep command parsing/orchestration in ticket 0006. Use `pavelmudroch/coderail` as the existing repository.

Expected outcome: resolve one release/build and its assets once. Omitted/latest selects newest stable; `X`, `X.Y`, and `X.Y.Z`, optionally prefixed by `v`, select newest matching stable or exact stable. Explicit selection permits downgrades. Canary consumes the dedicated `canary` prerelease and identifies the source commit. Map Windows/macOS/Linux x64/arm64 to all six Deno target triples.

Validation: task 1 resolution tests pass, including correct semantic ordering and no stable selection of prereleases.

### 3. Download, validate, and extract the selected distribution into staging

Scope: define concrete `build.json` and SHA-256 checksum formats, pinned asset identity, and safe extraction/staging helpers. Record this consumption contract in module documentation and fixtures for future publishers.

Expected outcome: select `coderail-<target>.zip`; validate its published SHA-256 and build version/commit/target against the resolved build. Require archive-root `cr` or `cr.exe`, `instructions/`, `templates/`, and `build.json`, without an `assets/` level. Reject unsafe paths, escaping links, malformed/duplicate destinations, and missing or changing publication identity before installation mutation. Return verified staged paths/build metadata and clean up temporary staging on completion/failure. Automatic GitHub source archives are never inputs.

Validation: task 1 package tests pass and exercise publication races, traversal/absolute paths, platform path collisions, and invalid executable/resource contents. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for each changed source/test file.

## References

- [Upgrade idea and release contract](../../plans/upgrade-command/IDEA.md)
- [Upgrade command](../../../src/commands/upgrade.ts)
- [Version metadata](../../../src/cli/version.ts)
- [Existing repository source](../../../install.sh)
- Consumers: tickets 0003 and 0004; final integration: ticket 0006.
