---
id: "0029"
slug: "configure-loop-models-and-effort-by-harness-and-stage"
title: "Configure loop models and effort by harness and stage"
status: "closed"
created_at: "2026-11-10T09:06:47.026Z"
updated_at: "2026-11-10T10:33:31.325Z"
dependencies: []
reason: "done"
---

# Configure loop models and effort by harness and stage

Allow users to save harness-specific loop defaults and resolve per-stage native
model/effort settings with the agreed CLI precedence. This ticket delivers
configuration loading and a reusable resolver; command option parsing and live
preflight wiring belong to ticket 0030.

## Tasks

1. [x] Add configuration validation and per-key merge tests
2. [x] Add independent stage-setting precedence tests
3. [x] Extend configuration types, validation, and merging
4. [x] Implement stage-setting resolution and document saved settings
5. [x] Verify every modified source and test file

## Task details

### 1. Add configuration validation and per-key merge tests

Scope: `tests/conf/load-configuration.test.ts` and parser coverage only where
needed by the existing underscore-to-camel-case conventions.

Expected outcome: accept `[loop.codex]` and `[loop.claude]`, each supporting
`model`, `effort`, `implement_model`, `implement_effort`, `review_model`,
`review_effort`, `commit_model`, and `commit_effort`. Reject malformed section
shapes, unknown harness/settings keys, non-string values, and empty values with
useful existing-style configuration diagnostics. Preserve native string values.
Global/project merging is by harness and individual setting, with project values
replacing matches and retaining omitted global values.

Validation: table-driven cases cover partial sections, independent providers,
invalid inputs, and per-key overrides without replacing entire harness sections.
Existing configuration behavior is unchanged outside the added sections.

### 2. Add independent stage-setting precedence tests

Scope: a focused resolver suite under `tests/commands/loop/`.

Expected outcome: resolve model and effort independently, highest first:
stage-specific CLI, common CLI, stage-specific configuration, common
configuration, native default (omitted). Only the selected harness applies.

Validation: independent expected-value tables exercise every level, including
common CLI overriding configured stage exceptions, explicit CLI stage exceptions,
model-only/effort-only overrides, and undefined native defaults. A configured
commit model must not survive a common CLI model unless CLI supplies its own
commit exception. Do not invent cross-provider model aliases or effort mappings.

### 3. Extend configuration types, validation, and merging

Scope: `src/conf/configuration.ts`, `src/conf/load-configuration.ts`; modify
`src/conf/parse.ts` only if demonstrated necessary.

Expected outcome: typed optional loop sections, existing configuration-format
conventions and metadata-aware validation, and the per-key merge from task 1.
No new environment variable surface or provider compatibility catalogue is needed.

Validation: task 1 passes, including global/project inheritance and validation.

### 4. Implement stage-setting resolution and document saved settings

Scope: a private helper under `src/commands/loop/` and the configuration section
of `README.md` (a commented init configuration example is optional).

Expected outcome: resolve the eight agreed hyphenated CLI setting keys against
underscored configuration keys for implement/review/commit. Leave omitted native
settings omitted. Document both harness sections, independent model/effort
precedence, and a compact `-o model=…,effort=…,commit-model=…` example for the
upcoming command. Explain that availability is validated by execution preflight,
not a static compatibility table. Do not claim equal effort budgets or fallback
detection across providers.

Validation: task 2 passes; examples match the resolver. Ticket 0030 consumes the
helper and validates compatibility for enabled stages before implementation.

### 5. Verify every modified source and test file

Scope: all source/test files changed in this ticket.

Expected outcome: record passing commands/results after fixing any failures.

Validation: run `cr verify ./src/<path-to-file>.ts` for each modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for each modified test file; repeat
affected checks after fixes until passing.

## Verification results

All required per-file checks passed:

- `cr verify ./src/conf/configuration.ts`
- `cr verify ./src/conf/load-configuration.ts`
- `cr verify ./src/commands/loop/resolve-stage-settings.ts`
- `cr verify ./tests/conf/load-configuration.test.ts`
- `cr verify ./tests/commands/loop/resolve-stage-settings.test.ts`

Final combined verification passed:

```sh
cr verify -s ./src/conf/configuration.ts ./src/conf/load-configuration.ts ./src/commands/loop/resolve-stage-settings.ts ./tests/conf/load-configuration.test.ts ./tests/commands/loop/resolve-stage-settings.test.ts README.md
```

The 12 focused tests passed. Both executable source files reached 100% line
coverage. Configured mutation checks reported no surviving mutations (all
generated mutations were classified as type errors). The type-only configuration
file passed lint; README had no applicable verification rule and was skipped.
`git diff --check` passed.

## References

- [Approved model, effort, and precedence specification](../../plans/loop-command/IDEA.md#agreed-model-and-effort-settings)
- [Edge cases, including configuration merging](../../plans/loop-command/IDEA.md#agreed-edge-case-contracts)
- [Configuration types](../../../src/conf/configuration.ts)
- [Configuration loader](../../../src/conf/load-configuration.ts)
- [Configuration parser](../../../src/conf/parse.ts)
- [Configuration tests](../../../tests/conf/load-configuration.test.ts)
- [User documentation](../../../README.md)
- [Repository verification instructions](../../../AGENTS.md)
- Consumer: ticket 0030; enabled review and commit combinations are exercised in 0031 and 0032.
