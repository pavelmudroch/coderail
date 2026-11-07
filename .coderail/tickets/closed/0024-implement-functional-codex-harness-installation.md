---
id: "0024"
slug: "implement-functional-codex-harness-installation"
title: "Implement functional Codex harness installation"
status: "closed"
created_at: "2026-11-07T12:25:48.268Z"
updated_at: "2026-11-07T12:56:21.529Z"
dependencies:
  - "0023"
reason: "done"
---

# Implement functional Codex harness installation

Make `cr install codex` and `cr uninstall codex` work globally and locally for
skills, whole-file general instructions, and native TOML subagents. Retain the
target-bound connector contract and shared installer/manifest lifecycle delivered
by ticket 0023. Keep this as one vertical delivery because the translations share
one connector module and require the same real command lifecycle coverage.

## Tasks

1. [x] Add Codex home and instruction translation tests
2. [x] Add Codex skill validation and invocation policy tests
3. [x] Add native Codex subagent serialization tests
4. [x] Add real Codex install/uninstall lifecycle and safety tests
5. [x] Implement Codex homes, general instructions, and skill translation
6. [x] Implement Codex native subagent translation
7. [x] Verify every modified source and test file

## Task details

### 1. Add Codex home and instruction translation tests

Scope: create `tests/harness/codex.test.ts` using existing connector test
conventions. Exercise the public methods without destination filesystem writes;
restore environment changes after each case. Establish fixtures for later tasks.

Expected outcome:

- Global home defaults to `~/.codex` for unset or empty `CODEX_HOME`, accepts an
  absolute override, and rejects a relative override with a clear error. Local
  home is the absolute project root and ignores all override values, including
  invalid relative ones. Later environment/target changes do not retarget home.
- General instructions output `AGENTS.md` relative to home in both scopes.
  Replace every `<skill>name</skill>` with `$name`, including repeated references,
  literal examples, code blocks, and names absent from the source bundle.
- Preserve all other general-instruction bytes, including line endings, Unicode,
  and BOM where present. Invalid UTF-8 fails with source path and reason.
- Translation leaves caller-owned records and bytes unchanged. Use these same
  ownership assertions for skills and agents in tasks 2 and 3.

Validation: direct method assertions fail against the placeholder and pass after
task 5; assert exact output paths/bytes, error context, and constructor behavior.

### 2. Add Codex skill validation and invocation policy tests

Scope: extend `tests/harness/codex.test.ts` with independent input/output fixtures.

Expected outcome:

- Global skill outputs use `skills/<name>/<source-path>`; local outputs use
  `.codex/skills/<name>/<source-path>`. Preserve directory structure.
- Reject missing root `SKILL.md`, including empty/support-only bundles; malformed
  frontmatter; missing, blank, or non-string name/description; directory/name
  mismatches; invalid root UTF-8; and nonboolean `disable-model-invocation` values.
  Errors identify the source path and reason.
- Replace all skill tags in root `SKILL.md`. Copy every supporting file unchanged,
  including nested Markdown with skill tags, text containing invalid UTF-8, and
  binary assets. Supporting files are neither translated nor UTF-8 validated.
- Explicit `disable-model-invocation: true` generates `agents/openai.yaml` with
  `policy.allow_implicit_invocation: false`; explicit false generates true.
  Remove the translated source field from output root frontmatter. Omission
  generates no policy file. Assert exact fixed-shape YAML fixtures.
- Ignore unsupported metadata, including `user-invocable: false` and combinations
  with supported flags; unsupported fields may remain in frontmatter. Continue
  rejecting malformed input and invalid supported options.
- Preserve root bytes except intentional transformations; generated metadata may
  use canonical serialization. Source bundles contain no `agents/openai.yaml`
  by explicit assumption; do not add merge or YAML parsing tests/capabilities.

Validation: assert complete output file sets and byte contents for both scopes,
both boolean values, omission, and invalid inputs. Fixtures use no YAML parser
and do not call implementation serialization helpers to compute expected bytes.

### 3. Add native Codex subagent serialization tests

Scope: extend `tests/harness/codex.test.ts` with independently specified native
TOML fixtures, following the established metadata validation cases.

Expected outcome:

- Convert Markdown name/description and body into TOML string fields `name`,
  `description`, and `developer_instructions`. Replace every skill tag in the
  translated text. Include repeated/unknown references and literal code examples.
- Require nonblank string name/description and a name equal to the source
  filename without `.md`. Cover malformed/missing metadata and invalid UTF-8;
  each failure names its source and reason.
- Flatten `review/worker.md` to global `agents/worker.toml` or local
  `.codex/agents/worker.toml`, preserving `worker` and other source names. Duplicate
  names yield duplicate paths for aggregate rejection in task 4.
- Ignore unsupported metadata. Emit only the three agreed string fields;
  model, reasoning, permissions, and feature settings remain inherited.
- Exact TOML fixtures cover quotes, backslashes, line breaks, tabs, control
  characters, and Unicode in values, preserving the intended strings and body.

Validation: compare complete native-format outputs against hand-specified
fixtures; introduce no TOML parser or parser-based round-trip verification.
Assertions fail before task 6 and pass afterward, including ownership checks.

### 4. Add real Codex install/uninstall lifecycle and safety tests

Scope: `tests/commands/install.test.ts` and `tests/commands/uninstall.test.ts`.
Use the real Codex connector and isolated temporary global/project homes; retain
existing shared stub coverage and reuse fixture conventions where practical.

Expected outcome:

- Install and uninstall representative skills with supporting/binary files,
  invocation YAML, a nested worker agent, and general instructions. Include
  representative bundled skills and `assets/instructions/agents/worker.md`.
  Assert installed paths, translated bytes, manifest entries, and removal.
- Cover global absolute overrides and local round trips; both commands reject
  relative global overrides and ignore them locally. Local manifest is
  `<projectRoot>/.coderail-install`; global manifest follows existing derivation
  from Codex home. Assert separate project/global homes and local Claude's
  `.claude` home/manifest remain isolated.
- Treat `AGENTS.md` as a wholly owned file: cover refusal for preexisting files,
  whole-file forced replacement, modified installed-file protection, and existing
  force/confirmation accept/decline behavior on install and uninstall. Uninstall
  removes owned files under existing protections. Preserve unrelated files,
  including `AGENTS.override.md`, and native discovery configuration.
- Retain no-source no-op behavior for new and existing installations and partial
  bundles. No source must leave prior files and manifest bytes unchanged.
- A valid asset preceding invalid skill/agent metadata, invalid UTF-8, or a
  duplicate flattened agent destination must not cause writes. Assert the same
  unchanged files/manifest for destination path/symlink inspection failures.
- Existing generated policy destinations use ordinary whole-file ownership and
  conflict handling; no YAML merge path is introduced.

Validation: inspect filesystem and manifest bytes in each scope using real
translations. Failure cases prove all translations, aggregate path validation,
and destination inspection complete before writes per harness. Reuse existing
shared coverage for general invariants instead of duplicating unrelated cases.

### 5. Implement Codex homes, general instructions, and skill translation

Scope: `src/harness/codex.ts`. Follow Claude's organization, validation/error
conventions, input ownership, and existing project utilities.

Expected outcome:

- Retain the target-bound constructor, `name`/`home`, all three translation
  signatures, and disposal. Resolve home once using task 1's rules; remove the
  unused placeholder `manifestPath` getter. Keep scope-dependent prefixes private
  to the Codex connector, with no destination-root API or parent traversal.
- Materialize general instructions and skills at the paths in tasks 1 and 2.
  Apply skill-tag replacement only to transformed instruction inputs, require
  their valid UTF-8, and copy supporting files byte-for-byte without mutation.
- Use `@md` for Markdown/frontmatter parsing and serialization. Validate root
  presence, required metadata, name matching, and the supported boolean flag.
  Remove that flag and emit its inverse as the fixed-shape invocation YAML only
  when explicitly present. Ignore unsupported options without inventing behavior.
- Keep canonical metadata serialization within the approved exception and retain
  source bytes otherwise. Use private helpers as needed; add no YAML/TOML parser,
  parser dependency, general format framework, or speculative shared abstraction.
- Connector methods translate bytes only. Shared commands retain discovery,
  validation, conflict handling, writes, and the unchanged version 1 whole-file
  manifest and `ConnectorFile` contract.

Validation: tasks 1 and 2 pass, and task 4's skill/general-instruction cases pass
once task 6 completes the connector. Review preservation and source-specific
errors explicitly. No changes to bundled policy or unrelated override files.

### 6. Implement Codex native subagent translation

Scope: finish `src/harness/codex.ts`, reusing its private validation and text
translation helpers from task 5. Keep this task sequential to avoid file overlap.

Expected outcome:

- Validate agent metadata through `@md`, require UTF-8, extract body text, and
  generate the three agreed TOML string fields with native escaping.
- Safely represent quotes, backslashes, newlines, tabs, control characters, and
  Unicode using private connector helpers rather than a parser/format framework.
- Apply skill-tag replacement to translated text, ignore unsupported metadata,
  preserve source names including `worker`, and flatten paths as in task 3.
  Leave duplicate destination rejection to existing aggregate validation.
- Preserve caller input records/bytes and report source path/reason on failure.
  Keep all model/permission settings inherited and retain shared lifecycle APIs.

Validation: task 3 fixtures and all task 4 real-connector lifecycle/safety cases
pass. Review generated TOML against the independent expected fixtures and confirm
no parser dependency or unnecessary shared installer changes were introduced.

### 7. Verify every modified source and test file

Scope: all source/test files actually changed during implementation, including
any necessary caller adjustments. Do not broaden shared modules without a
demonstrated need and focused coverage.

Expected outcome: complete required verification, fix failures, and repeat affected
checks until passing. Record commands and results in implementation notes.

Validation:

- Run `cr verify ./src/<path-to-file>.ts` for every modified source file.
- Run `cr verify ./tests/<path-to-file>.test.ts` for every modified test file.
- Confirm coverage of tasks 1–4, unchanged public connector/manifest contracts,
  no new YAML/TOML parser dependencies, and preservation of shared pre-write
  validation and whole-file ownership. Tests require no live Codex account.

## References

- [Approved idea and agreed format/behavior specification](../../plans/codex-harness-connector/IDEA.md)
- [Prerequisite ticket 0023](../closed/0023-implement-functional-claude-harness-installation.md)
- [Local installation ticket 0012, completed via 0023's prerequisite chain](../closed/0012-support-project-local-harness-instruction-installation.md)
- [Claude connector idea](../../plans/claude-harness-connector/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [Codex connector](../../../src/harness/codex.ts)
- [Connector contract](../../../src/harness/connector.ts)
- [Claude implementation reference](../../../src/harness/claude.ts)
- [Harness factory](../../../src/harness.ts)
- [Instruction loader](../../../src/commands/helpers/get-instruction-files.ts)
- [Install command](../../../src/commands/install.ts)
- [Uninstall command](../../../src/commands/uninstall.ts)
- [Manifest API](../../../src/install-manifest.ts)
- [Markdown API](../../../src/md.ts)
- [Claude test conventions](../../../tests/harness/claude.test.ts)
- [Install integration tests](../../../tests/commands/install.test.ts)
- [Uninstall integration tests](../../../tests/commands/uninstall.test.ts)
- [Bundled skills](../../../assets/instructions/skills/)
- [Bundled worker](../../../assets/instructions/agents/worker.md)
- Codex documentation recorded in the approved idea (checked 2026-11-07):
  [skills](https://learn.chatgpt.com/docs/build-skills),
  [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents),
  [execution rules](https://learn.chatgpt.com/docs/agent-configuration/rules), and
  [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Implementation notes

- Implemented target-bound Codex homes, whole-file AGENTS.md translation,
  root-only skill translation, explicit invocation policies, and flattened native
  TOML agents. Supporting bytes and caller inputs remain unchanged. Existing
  connector, installer, and version 1 manifest contracts are retained; no parser
  dependencies or shared lifecycle changes were needed.
- Added independent byte fixtures and real global/local command coverage,
  including bundled skills and worker, manifest isolation, no-source and partial
  bundles, whole-file conflicts and confirmations, malformed metadata/UTF-8,
  duplicate agents, and destination inspection failures before writes.
- Passed `cr verify ./src/harness/codex.ts`,
  `cr verify ./tests/harness/codex.test.ts`,
  `cr verify ./tests/commands/install.test.ts`, and
  `cr verify ./tests/commands/uninstall.test.ts`.
  The suites contain 78 passing tests, with 100% required coverage. Checks use no
  live Codex account. Pre-existing staged Claude/help changes were preserved.
- Final combined verification passed:
  `cr verify -s ./src/harness/codex.ts ./tests/harness/codex.test.ts ./tests/commands/install.test.ts ./tests/commands/uninstall.test.ts`.
  Combined coverage initially exposed a zero-argument uninstall branch accounting
  gap; the real Codex round trip now also exercises configured default-harness
  uninstallation. Individual and combined checks pass without shared code changes.
