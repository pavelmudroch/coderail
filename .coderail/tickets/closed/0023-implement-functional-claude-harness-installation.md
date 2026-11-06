---
id: "0023"
slug: "implement-functional-claude-harness-installation"
title: "Implement functional Claude harness installation"
status: "closed"
created_at: "2026-11-06T19:27:37.578Z"
updated_at: "2026-11-06T19:37:51.988Z"
dependencies:
  - "0012"
reason: "done"
---

# Implement functional Claude harness installation

Make `cr install claude` and `cr uninstall claude` work globally and locally for
skills, general instructions, and subagents. Support partial instruction bundles,
validate supplied Claude assets before installation, and retain shared manifest,
conflict, and path protections. This is one vertical implementation unit following
ticket 0012's target-aware command plumbing.

## Tasks

1. [x] Add optional-source loading and installation safety tests
2. [x] Add Claude connector translation and home-resolution tests
3. [x] Add real Claude installation and removal lifecycle tests
4. [x] Load optional instruction sources and conditionally translate general instructions
5. [x] Implement target-bound Claude homes and byte-preserving translations
6. [x] Verify every modified source and test file

## Task details

### 1. Add optional-source loading and installation safety tests

Scope: `tests/commands/install.test.ts`; add focused loader tests under
`tests/commands/helpers/` if that keeps discovery assertions independent of command
fixtures. Use stub connectors to observe supplied inputs and translation calls.

Expected outcome:

- Cover independently absent `instructions/`, `skills/`, `agents/`, and general
  `AGENTS.md`, plus partial bundles. Missing collections are empty arrays; missing
  general instructions are `null` and never call `translateGlobalInstructions`.
- A bundle with no sources succeeds without filesystem mutation, both with a new
  destination and with an existing installation; installed assets and manifests
  remain unchanged.
- Preserve discovered empty skill directories and directories containing only
  supporting files so the connector can reject their missing root `SKILL.md`.
  Shared loading does not enforce harness-specific completeness.
- Existing unreadable files and other non-absence filesystem failures remain
  observable. Optional-source handling must not swallow these failures.
- A later translation error or destination inspection failure prevents every
  write for that harness, even when earlier assets are valid. Retain aggregate
  path validation, duplicate/parent collision protection, conflict handling, and
  symlink protections.

Validation: new behavior assertions fail against current unconditional loading;
after implementation, fixtures demonstrate the input contract, skipped translation
call, and unchanged destination bytes/manifest on failure or no-source success.

### 2. Add Claude connector translation and home-resolution tests

Scope: new `tests/harness/claude.test.ts`, following existing test conventions;
extend `tests/harness.test.ts` only if factory coverage needs adjustment. Test the
public connector contract without filesystem mutation and restore environment
changes after each case.

Expected outcome:

- Global home is `~/.claude` when `CLAUDE_CONFIG_DIR` is unset or empty, accepts
  an absolute override, and clearly rejects a relative override. Local home is
  `<projectRoot>/.claude`, ignoring even invalid relative overrides. Resolve home
  once; later environment or caller target changes do not retarget the connector.
- Skills map to `skills/<name>/<relative-source-path>`, retaining nested
  supporting files. Subagents map beneath `agents/` without flattening nested
  paths. General instructions map to `rules/coderail.md` in either scope.
- Reject missing root `SKILL.md`, including an empty skill input. Skill and
  subagent frontmatter require nonblank string `name` and `description`; cover
  absent/malformed frontmatter and missing, blank, and non-string properties.
- Skill metadata `name` exactly equals its source directory name. Subagent name
  equals the filename without `.md`, so `review/worker.md` requires `worker`.
  Translation errors include the source path and reason.
- Instruction Markdown rejects invalid UTF-8. Binary supporting assets remain
  byte-identical. Valid content retains its original bytes, formatting, and
  frontmatter except the agreed skill-tag replacement; metadata inspection must
  not normalize or reserialize the source.
- Replace every `<skill>name</skill>` with `/name` in instruction text across
  skill files, nested supporting files, subagents, and general instructions,
  including frontmatter, literal examples, and code blocks. Cover multiple and
  repeated tags and references absent from the bundle. Preserve unrelated markup
  and existing slash commands.
- Preserve explicit `user-invocable: true`, `false`, and omission, independently
  of `disable-model-invocation`, including combinations of the two fields.
  Preserve caller-owned records and byte arrays.

Validation: exercise each translation method directly with byte-level assertions,
including BOM/line-ending or other formatting fixtures where useful to detect
unintended rewriting. Tests fail on the placeholder implementation and pass after
task 5. No new public helper API is required.

### 3. Add real Claude installation and removal lifecycle tests

Scope: `tests/commands/install.test.ts` and `tests/commands/uninstall.test.ts`.
Use the real Claude connector with isolated temporary project and global homes,
keeping existing stub-based shared command coverage.

Expected outcome:

- Install a representative bundle containing a skill with nested supporting and
  binary assets, a nested subagent, and general instructions. Assert translated
  native paths/content and manifest entries, then uninstall owned files.
- Exercise representative bundled skills and `assets/instructions/agents/worker.md`.
  Do not add a bundled general `AGENTS.md` just to complete the fixture.
- Cover global override and local round trips, separate project homes, and local
  versus global manifest isolation. Both install and uninstall honor the same
  absolute global override, reject a relative global override, and ignore it for
  local operations. Assert unrelated harness homes/manifests remain untouched
  without requiring the unfinished Codex connector.
- Existing `CLAUDE.md` files remain untouched; general instructions use the
  dedicated `rules/coderail.md` with no injected path-scoping frontmatter.
- Retain existing-file/modified-file protection and force/confirmation behavior;
  unrelated files survive uninstall. A malformed later asset or unsafe destination
  leaves all destinations and manifest bytes unchanged.

Validation: round trips assert filesystem and manifest results in each scope,
including existing-file refusal. Test fixtures exercise installed bytes rather
than replacing the real Claude translator with a stub.

### 4. Load optional instruction sources and conditionally translate general instructions

Scope: `src/commands/helpers/get-instruction-files.ts` and
`src/commands/install.ts`. Extend an owning shared module only if its existing
API lacks a necessary capability; include focused tests for any extension.

Expected outcome:

- Change `InstructionFiles.globalInstructionFile` to `InstructionFile | null`;
  keep skills/subagents as arrays and keep `HarnessConnector` signatures intact.
- Discover only existing sources, tolerating absent roots/categories/general
  instructions while preserving discovered skills with empty file lists.
- Reuse `Fs` for operations its API supports, preserving non-absence errors.
  Do not use a broad error-swallowing existence check to decide optional absence.
- Call `translateGlobalInstructions` only for a present file. No sources produce
  a successful no-op without writes, deletions, or removal of prior assets.
- Keep all translation, aggregate destination-path validation, and destination
  inspection before writes for that harness. Reuse existing shared ordering;
  add no separate connector inspection phase or harness completeness checks.

Validation: task 1 tests pass, existing shared installation/path/conflict tests
remain valid, and type-checking identifies and reconciles any nullable-contract
callers or fixtures. Do not modify instruction bundle policies or add
`assets/instructions/AGENTS.md`.

### 5. Implement target-bound Claude homes and byte-preserving translations

Scope: `src/harness/claude.ts`. Reuse `@md`, `@path`, and relevant established
utilities; any required shared capability belongs in its owning module with
appropriate tests.

Expected outcome:

- Retain `new ClaudeConnector(target)`, `name`, `home`, all three translation
  signatures, and disposal. Resolve an absolute immutable home using task 2's
  scope/environment rules; remove the unused placeholder `manifestPath` getter.
- Materialize relative output paths for skills, nested subagents, and
  `rules/coderail.md` as specified above. Connector methods only translate bytes;
  shared commands retain filesystem mutation and manifest ownership.
- Validate root skill presence and required skill/subagent metadata via
  `Md.parse`. Keep validation separate from output generation; introduce no
  connector-specific Markdown/frontmatter parser or serializer and no defaults.
- Apply the exact skill-tag replacement throughout translated instruction text,
  preserve binary supporting bytes, reject invalid instruction Markdown UTF-8,
  and leave every other byte and caller input unchanged. Binary classification
  and private helper organization are implementation choices within these rules.
- Preserve invocation metadata without selecting new bundled skill policies.
  Report source-specific translation failures and rely on the existing shared
  validation/inspection-before-write pipeline.

Validation: task 2 connector tests and task 3 real lifecycle tests pass. Review
shared-module reuse and byte preservation explicitly. Keep Codex implementation,
new home flags, new abstractions, and bundled asset changes outside this ticket.

### 6. Verify every modified source and test file

Scope: the final set of source and test files actually changed by this ticket,
including any shared-module extensions and adjusted callers.

Expected outcome: complete repository-required verification after modifications,
fix failures, and repeat affected checks until they pass. Record checks performed
and their results in implementation notes.

Validation:

- Run `cr verify ./src/<path-to-file>.ts` for every modified source file.
- Run `cr verify ./tests/<path-to-file>.test.ts` for every modified test file.
- Confirm executable coverage for the cases in tasks 1–3 and review that no
  duplicate Markdown parser/serializer or extra connector inspection phase was
  introduced. No external Claude installation or account is needed for fixtures.

## References

- [Approved idea](../../plans/claude-harness-connector/IDEA.md)
- [Prerequisite ticket 0012](../closed/0012-support-project-local-harness-instruction-installation.md)
- [Local installation idea](../../plans/local-harness-instruction-installation/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [Connector contract](../../../src/harness/connector.ts)
- [Claude connector](../../../src/harness/claude.ts)
- [Harness factory](../../../src/harness.ts)
- [Instruction loader](../../../src/commands/helpers/get-instruction-files.ts)
- [Install command](../../../src/commands/install.ts)
- [Uninstall command](../../../src/commands/uninstall.ts)
- [Markdown API](../../../src/md.ts)
- [Filesystem API](../../../src/fs.ts)
- [Path API](../../../src/path.ts)
- [Install manifest API](../../../src/install-manifest.ts)
- [Harness tests](../../../tests/harness.test.ts)
- [Install tests](../../../tests/commands/install.test.ts)
- [Uninstall tests](../../../tests/commands/uninstall.test.ts)
- [Runtime discovery tests](../../../tests/runtime/context.test.ts)
- [Bundled skills](../../../assets/instructions/skills/)
- [Bundled worker subagent](../../../assets/instructions/agents/worker.md)
- [Claude skills documentation](https://code.claude.com/docs/en/skills)
- [Claude subagent documentation](https://code.claude.com/docs/en/sub-agents)
- [Claude memory documentation](https://code.claude.com/docs/en/memory)
- [Claude directory documentation](https://code.claude.com/docs/en/claude-directory)


## Implementation notes

- Optional collections load as empty arrays and absent general instructions as
  `null`. Discovered empty/support-only skill directories reach the connector.
  Non-absence filesystem errors propagate; an empty bundle leaves installations
  and manifests untouched.
- Claude connectors bind their global override/default home or project home at
  construction. Skills and nested agents retain their paths; general instructions
  install to `rules/coderail.md`, preserving existing `CLAUDE.md` files.
- Metadata validation uses `Md.parse` without serialization. UTF-8 instruction
  content retains its BOM, line endings, formatting, and invocation metadata except
  skill-tag replacements; binary supporting files retain their bytes.
- Shared translation, aggregate path validation, and destination inspection remain
  before writes. No separate inspection phase, Markdown parser, Codex changes,
  or bundled asset policy changes were introduced.

Validation completed successfully:

- `cr verify ./src/commands/helpers/get-instruction-files.ts`
- `cr verify ./src/commands/install.ts`
- `cr verify ./src/harness/claude.ts`
- `cr verify ./tests/commands/helpers/get-instruction-files.test.ts`
- `cr verify ./tests/commands/install.test.ts`
- `cr verify ./tests/commands/uninstall.test.ts`
- `cr verify ./tests/harness/claude.test.ts`
- `cr verify -s` with exactly the seven changed source/test files above.
- `git diff --check`

The four focused suites contain 66 passing tests. Coverage checks meet the
repository's 100% thresholds. Mutation commands pass with no surviving mutations;
the current runner classified generated mutations as type errors and generated
none for the loader, so these results do not establish mutation-kill coverage.
All filesystem lifecycle tests use isolated temporary homes and require no Claude
installation or account.
