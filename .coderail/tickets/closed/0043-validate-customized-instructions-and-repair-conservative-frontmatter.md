---
id: "0043"
slug: "validate-customized-instructions-and-repair-conservative-frontmatter"
title: "Validate customized instructions and repair conservative frontmatter"
status: "closed"
created_at: "2026-11-12T10:20:46.179Z"
updated_at: "2026-11-12T10:54:31.689Z"
dependencies:
  - "0042"
reason: "done"
---

# Validate customized instructions and repair conservative frontmatter

Allow customized instruction Markdown to pass content validation and narrowly repair supported name/frontmatter defects without regenerating instructions or changing ownership baselines. Depends on 0042 for repair execution.

## Tasks

1. [x] Add instruction selection, customization and preservation tests
2. [x] Implement instruction frontmatter diagnostics and narrow edits
3. [x] Integrate asset and owned-instruction checks with integrity policy
4. [x] Verify instruction repairs through doctor
5. [x] Align closing-delimiter recognition with the Markdown parser

## Task details

### 1. Add instruction selection, customization and preservation tests

Scope: new instruction diagnostic tests, installation tests and doctor integration fixtures.

Expected outcome: cover asset skills/Markdown subagents and owned global/local harness instructions; exclude unowned installed instructions and installed Codex TOML agents from Markdown repair. Cover customized valid content, wrong/missing names, strict missing-opener recognition, missing closer/both delimiters, malformed metadata and missing/blank descriptions. Assert preservation of body bytes, description, unrelated fields, BOM, line endings and ownership manifests/checksums. Cover changed input, cancellation, idempotence and plain-doctor no writes.

Validation: establish failing behavioral cases before tasks 2–3; include source and compiled resources plus strict binary/other distribution integrity checks.

### 2. Implement instruction frontmatter diagnostics and narrow edits

Scope: new `src/commands/doctor/instructions.ts`; reuse the existing Markdown parser without broad parser behavior changes.

Expected outcome:

- Export `Instructions.checkAssets(resourceRoot: string, signal: AbortSignal): Promise<DoctorReport>` and `Instructions.checkFile(path: string, expectedName: string, signal: AbortSignal): Promise<DoctorReport>`.
- Require nonblank string name/description and expected names: skill directory name or Markdown subagent filename stem. Insert/correct name only in parseable frontmatter with a usable description.
- Restore a missing opener only if the file starts with parseable metadata containing a nonblank description and an existing closing delimiter identifies the body boundary. Missing closing/both delimiters, malformed metadata and unusable descriptions remain manual findings.
- Attach guarded actions using 0042's interface; revalidate input before writes. Preserve customized content and existing checksum baselines, with no regeneration.

Validation: task 1 boundary/preservation fixtures pass; repeated repair produces no further edits and concurrent changes fail safely.

### 3. Integrate asset and owned-instruction checks with integrity policy

Scope: `src/commands/doctor/installation.ts` and its existing local/global discovery integration.

Expected outcome: Installation retains manifest-based installed discovery and passes only owned Markdown candidates to checkFile; scan all asset skills and Markdown subagents through checkAssets. Validate instruction Markdown content instead of failing solely on ownership checksum changes, including compiled distribution instruction Markdown. Missing owned files and unreadable/unsupported entries still fail; binaries and other distribution entries retain strict checksums. Never update manifests/checksums to absorb edits. Installer/uninstaller semantics remain unchanged; distribution recovery, PATH edits and executable installation remain outside scope.

Validation: source/compiled, global/local, owned/unowned and strict noninstruction integrity fixtures from task 1 pass; valid customized instructions remain customized after repair and subsequent diagnostics.

### 4. Verify instruction repairs through doctor

Scope: command-level integration tests using 0042's action runner.

Expected outcome: supported defects are repaired without prompts; unsupported findings retain manual guidance, independent actions survive partial failure, and final results/exit status follow post-repair diagnostics.

Validation: task 1 suites and command integration pass; run per-file `cr verify` for every modified/new src and tests file, fixing failures until each passes.

### 5. Align closing-delimiter recognition with the Markdown parser

Blocking review finding: `src/commands/doctor/instructions.ts:44` uses a multiline
`$` anchor, which also matches before a bare carriage return. Consequently,
`---\nname: worker\ndescription: custom\n---\rbody` passes `Instructions.checkFile`
with no findings, although `Md.parse` rejects it with `Unclosed frontmatter at
line 1`. With a wrong name or missing opener, doctor instead offers a repair
that still leaves the file unparseable. This violates the requirement to leave
missing closing delimiters as manual findings.

Scope: add regression cases in `tests/commands/doctor/instructions.test.ts`, then
correct delimiter detection in `src/commands/doctor/instructions.ts` without
changing the shared parser.

Expected outcome: recognize only standalone delimiter lines separated by LF or
CRLF, or a delimiter at the actual end of the file, consistent with `Md.parse`.
Do not treat the multiline anchor's other line terminators as valid boundaries.
Files with `---\rbody` must produce a manual finding and no action, whether the
name is correct, wrong, or the opening delimiter is missing; preserve all bytes.

Validation: demonstrate the regression cases fail before the correction and pass
afterwards. Retain valid LF/CRLF and delimiter-at-EOF behavior. Run the affected
doctor suites and per-file `cr verify` after implementation changes.

Review validation: all 32 instruction, installation and command tests passed;
read-only `bun lint` on the five affected source/test files and `git diff --check`
passed. A separate temporary-file reproduction confirmed the parser disagreement.

Task 5 validation: the new delimiter regression failed before the correction and
passed afterwards. All 33 instruction, installation and command tests passed.
Separate `cr verify` invocations for the changed instruction source and test file,
the final aggregate `cr verify -s` for both files, and `git diff --check` passed.

## References

- [Agreed repair specification](../../plans/doctor-command---repair-flag/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [src/commands/doctor/installation.ts](../../../src/commands/doctor/installation.ts)
- [src/md/helpers/frontmatter.ts](../../../src/md/helpers/frontmatter.ts)
- [src/md.ts](../../../src/md.ts)
- [tests/commands/doctor/installation.test.ts](../../../tests/commands/doctor/installation.test.ts)
- [tests/commands/doctor.test.ts](../../../tests/commands/doctor.test.ts)
- Dependency: [0042 — Repair doctor project initialization with collected actions](0042-repair-doctor-project-initialization-with-collected-actions.md)
