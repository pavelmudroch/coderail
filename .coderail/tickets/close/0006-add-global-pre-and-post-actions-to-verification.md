---
title: Add global pre and post actions to verification
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Add global pre and post actions to verification

Replace the verification rule array with a verification object containing `rules` and optional global `pre` and `post` command lists. Preparation runs once before verification commands; cleanup runs once afterward, including when preparation or verification fails. These actions support preparing test resources and removing coverage or mutation temporary directories.

## Configuration

```toml
[verify]
pre = [
    ["rm", "-rf", "coverage", ".mutation-tmp"],
    ["mkdir", "-p", "coverage"],
]
post = [
    ["rm", "-rf", ".mutation-tmp"],
]

[[verify.rules]]
pattern = "src/**/*.ts"
commands = [["deno", "check"], ["deno", "test", "--coverage=coverage"]]
requires = ["deno.json"]

[[verify.rules]]
pattern = "tests/**/*.ts"
commands = [["deno", "test"]]
```

`pre` and `post` are optional. Without either, users can write only `[[verify.rules]]` entries. Actions belong to the entire invocation, never to an individual rule or file.

## Tasks

1. [x] Add configuration and lifecycle acceptance tests
2. [x] Update verification types, validation, defaults, and merging
3. [x] Execute global preparation and cleanup around verification
4. [x] Update configuration examples and verification documentation

## Task details

### 1. Add configuration and lifecycle acceptance tests

Scope: extend `tests/conf/load-configuration.test.ts` and verification command tests. Use child processes and filesystem markers to verify actual ordering and execution counts.

Expected outcome:

- Accept `verify.rules`, optional `verify.pre`/`verify.post`, multiline command arrays, and rules-only configuration with an implicit parent object.
- Reject malformed action lists and unknown properties with accurate nested configuration paths and source locations.
- Cover global/local configuration merging, omitted verification configuration, and rejection of the old `[[verify]]` array shape.
- Cover one preparation and cleanup sequence across multiple rules/files, preparation failure, verification failure, command launch failure, multiple cleanup failures, and cleanup-only failure.
- Cover no matching verification work and preparation creating a file referenced by `requires`.
- Verify global actions execute independently of verification command result reuse, including identical argument arrays in different phases.

Validation: tests assert observable execution order, exit status, and diagnostics; preserve existing per-file verification behavior.

### 2. Update verification types, validation, defaults, and merging

Scope: `src/conf/configuration.ts`, `src/conf/load-configuration.ts`, and consumers of the previous verification array.

Expected outcome:

- Introduce `VerifyRule` with existing `pattern`, `commands`, and optional `requires` members.
- Define `Verify` as `{ rules: VerifyRule[]; pre?: CommandDefinition[]; post?: CommandDefinition[] }`; use `verify: Verify` in `Configuration`.
- Default to `{ rules: [] }`; normalize omitted rule lists to an empty list when loading partial configuration.
- Validate action commands using the same argument-array structure as rule commands.
- Append global then local entries independently for `rules`, `pre`, and `post`, preserving source order. Omitted members do not erase earlier configuration.
- Update rule compilation and all other consumers to read `configuration.verify.rules`.
- Treat this as a configuration shape change; explain migration from `[[verify]]` to `[[verify.rules]]` rather than maintaining two accepted forms.

Validation: configuration tests cover defaults, partial objects, merging, invalid structures, and unchanged configuration error metadata.

### 3. Execute global preparation and cleanup around verification

Scope: verification orchestration and command execution helpers. The current `src/commands/verify.ts` is a stub in this checkout; reconcile it with the existing verification design and related tickets before implementation rather than assuming their closed status means their code is present.

Expected outcome:

- Validate configuration, patterns, references, and file selection before starting actions.
- Skip actions when no selected file matches a rule containing a nonempty verification command. Keep `requires` checks at rule execution time after preparation, since preparation may create required files.
- Execute nonempty preparation commands sequentially once, then run verification with its existing per-file ordering, dependency checks, failure policy, and result reuse.
- Stop preparation on its first failure and skip verification. Once preparation begins, attempt cleanup in a `finally` path even after preparation or verification errors.
- Execute every nonempty cleanup command sequentially, continuing after individual failures or launch errors.
- Run actions from the project root with the same argument boundaries and output capture conventions as verification commands. Do not implicitly invoke a shell or substitute per-pattern captures into global actions.
- Do not cache or deduplicate global actions against each other or against verification commands.
- Preserve the original preparation/verification failure and report cleanup failures alongside it. Cleanup failure alone makes the invocation fail; successful cleanup never clears an earlier failure.
- Identify preparation and cleanup failures without assigning them to an arbitrary file; preserve short/quiet reporting conventions.
- Keep cancellation semantics consistent with the CLI and document the cleanup boundary. Cleanup after forced process termination cannot be guaranteed.

Validation: run `cr test ./src/<changed-file>.ts` and `cr test ./tests/<changed-test-file>.test.ts` for each changed source/test file, fixing failures until all pass. Include existing verification regression tests when available.

### 4. Update configuration examples and verification documentation

Scope: the configuration scaffold, `.coderail/coderail.conf`, verification help, and verification design documentation.

Expected outcome:

- Replace old `[[verify]]` examples with `[[verify.rules]]`.
- Include both a rules-only example and a global preparation/cleanup example using argument arrays.
- Explain once-per-invocation scope, configuration merging order, no-match behavior, and failure handling.
- Update design contracts that currently describe `Configuration['verify']` as an array.

Validation: examples parse and load under the new schema; search maintained examples and contracts for stale verification-array usage. Run the prescribed tests for any source/test files changed while updating scaffolding or help.

## References

- [Verification configuration types](../../../src/conf/configuration.ts)
- [Configuration loading and validation](../../../src/conf/load-configuration.ts)
- [Configuration acceptance tests](../../../tests/conf/load-configuration.test.ts)
- [Verification command](../../../src/commands/verify.ts)
- [Verification design](../../plans/verify-command/DESIGN.md)
- [Verification decisions](../../plans/verify-command/IDEA.md)
- [Related ticket 0005: CLI integration and reporting](../close/0005-integrate-verify-cli-and-result-reporting.md)
- [Related ticket 0004: check execution and result reuse](../close/0004-execute-verification-checks-with-result-reuse.md)
