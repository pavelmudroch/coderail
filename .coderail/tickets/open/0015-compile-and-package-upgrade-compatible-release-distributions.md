---
id: "0015"
slug: "compile-and-package-upgrade-compatible-release-distributions"
title: "Compile and package upgrade-compatible release distributions"
status: "open"
created_at: "2026-11-05T08:56:00.945Z"
updated_at: "2026-11-05T08:56:00.945Z"
dependencies:
  - "0013"
---

# Compile and package upgrade-compatible release distributions

Provide the shared per-target packaging CLI used by stable and canary publication. A successful command produces a real compiled executable, an upgrade-compatible archive, and an exact checksum sidecar from one identified source revision. Depends on 0013 so absent resource directories pass the existing consumer.

## Tasks

1. [ ] Add packaging contract and consumer-compatibility tests
2. [ ] Implement per-target compilation and strict archive production
3. [ ] Validate real package outputs and document the packaging interface

## Task details

### 1. Add packaging contract and consumer-compatibility tests

Scope: add focused tests under `tests/tools/`; reuse `src/commands/upgrade/distribution.ts` via a fake GitHub release transport. Keep existing staging consumption as the ZIP compatibility authority, rather than writing another validator. Use disposable source repositories and output roots.

Expected outcome:

- Cover `deno run -A tools/package.ts --target <triple> --version <X.Y.Z|canary> --commit <full-sha> --output <directory>`, required/invalid arguments, unsupported targets, invalid identity, HEAD mismatch, compilation failure, and package validation failure.
- `--help` succeeds on stdout outside a checkout without other arguments, network, repository checks, file mutation, compilation, or packaging; explain required options and archive/sidecar outputs.
- Assert archive names, executable headers for all six targets, exact build metadata, strict checksum formatting, and staging compatibility. Verify stable executable version matches the supplied version and source version; canary metadata uses `canary` and identifies the exact source commit without requiring a stable source version of `canary`.
- Exercise missing/empty source instructions and templates independently and together, omitted and empty archive directories, nested nonempty resources, and rejection of file/symlink resource roots or unsafe contents. No placeholder resources.
- Corruption, identity mismatch, incompatible ZIP layout, missing outputs, and invalid executable architecture fail before a package is considered ready.

Validation: lightweight negative-path tests may stub compilation, but acceptance also exercises real compiler outputs through the staging consumer with a fake transport. Run applicable per-file `cr verify` for modified tests after implementation.

### 2. Implement per-target compilation and strict archive production

Scope: create `tools/package.ts`, compiling `src/main.ts` from the checked-out revision. Keep private helpers implementation-defined and retain existing consumer exports. Use a pinned Deno compiler version supporting Windows ARM64 (at least 2.9.3) consistently with CI; validate any native npm dependencies in the actual compiled graph for each target.

Expected outcome:

- Require HEAD to equal the supplied full lowercase 40-character commit. Stable version is canonical X.Y.Z and agrees with source/executable version; canary uses the exact supplied commit for metadata identity.
- Support x86_64/aarch64 for unknown-linux-gnu, apple-darwin, and pc-windows-msvc. Produce `coderail-<target>.zip` and `<archive>.sha256` in the supplied output directory.
- ZIP root contains `cr` (Windows `cr.exe`) and `build.json`; copy optional source `assets/instructions/` and `assets/templates/` to root resource directories without an `assets/` prefix.
- Metadata is exactly the agreed schema: `{schemaVersion:1, version:"X.Y.Z"|"canary", commit:"<full-sha>", target:"<triple>"}`. Sidecar is exactly `<lowercase SHA-256>  <archive name>\n` with a real trailing newline.
- Produce classic single-disk ZIP with stored/deflated entries, no data descriptors, ZIP64, links, archive comments, unsupported paths, or empty resource files. Validate compatibility through the existing staging consumer, including its size/path restrictions.
- Invalid identity, compilation, or output validation exits unsuccessfully with the failed step identified. This entrypoint performs no GitHub publication and adds no application-test gate.

Validation: task 1 passes; run real packaging into disposable output directories. Run required per-file `cr verify` for modified source/tests. Do not generate release artifacts in tracked distribution paths.

### 3. Validate real package outputs and document the packaging interface

Scope: supply reusable package checks and usage documentation consumed by workflows in 0016 and 0017. Keep checks separate from application-test gating; private helpers/test seams are implementation choices.

Expected outcome: verify executable format/architecture, source/version/commit/target identity, exact SHA-256 sidecars, safe layout, resource contents, and successful staging of each produced archive via fake transport. Smoke-test executable version and flattened runtime resource lookup on matching platforms, including first installation and subsequent upgrade in disposable installation roots. Cross-compilation alone does not establish runtime execution; schedule matching platform checks in downstream workflows where required.

Validation: exercise all six real compiler outputs and record matching-platform smoke coverage or explicit runner limitations in implementation validation. Demonstrate stable and canary package identities; check first-install and upgrade behavior with optional resources. Document invocation and the requirement that all six checked packages exist before either publisher creates a public release. Do not publish to GitHub during validation.

## References

- [Ship plan: release contract and packaging interface](../../plans/ship-tool-and-release-publishing/IDEA.md)
- [Existing staging consumer](../../../src/commands/upgrade/distribution.ts)
- [Release fixtures](../../../tests/commands/upgrade/release-fixture.ts)
- [Runtime resource lookup](../../../src/runtime/context.ts)
- [Application entrypoint](../../../src/main.ts)
- [Version constant](../../../src/cli/version.ts)
- [Deno configuration and dependency graph](../../../deno.json)
- [Deno compile documentation](https://docs.deno.com/runtime/reference/cli/compile/)
- Dependency: [0013 optional resources](0013-support-optional-resources-in-upgrade-distributions.md).
- Consumers: [0016 stable publishing](0016-publish-stable-releases-from-version-tags.md), [0017 canary publishing](0017-publish-fresh-main-tip-canary-distributions.md).
