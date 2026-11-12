---
id: "0047"
slug: "preserve-and-merge-configuration-documents-for-templates"
title: "Preserve and merge configuration documents for templates"
status: "closed"
created_at: "2026-11-12T13:49:21.203Z"
updated_at: "2026-11-12T14:04:12.102Z"
dependencies: []
reason: "done"
---

# Preserve and merge configuration documents for templates

Provide the configuration document APIs needed to persist template settings without losing supported comments or changing runtime configuration precedence. This is the shared prerequisite for metadata creation and template application.

## Tasks

1. [x] Specify configuration document and validation behavior in tests
2. [x] Capture comments and stringify configuration documents
3. [x] Merge and normalize configuration documents
4. [x] Extract reusable settings validation and expose the Conf contract

## Task details

### 1. Specify configuration document and validation behavior in tests

Scope: extend `tests/conf/parse.test.ts` and `tests/conf/load-configuration.test.ts`; add `tests/conf/stringify.test.ts`, `tests/conf/merge.test.ts`, and `tests/conf/validate-configuration.test.ts`.

Expected outcome: fixtures cover comment association and isolation, round trips, nonmutating merges, ordered precedence, normalized deduplication, and shared validation without defaults. Keep parser/source-location, runtime-loading, and doctor regression coverage.

Validation: assertions independently distinguish nested paths, array comments, normalized rule equality, command argument order, and runtime precedence. Establish behavioral failures before tasks 2–4; run each changed test file's `cr verify ./tests/<path>.test.ts` after implementation and fix failures until passing.

### 2. Capture comments and stringify configuration documents

Scope: `src/conf/parse.ts`, new `src/conf/stringify.ts`, and document/comment types owned by Conf.

Expected outcome:

- Keep `toObject()` and `getMeta()` compatible; add `getComments()` returning an independent `Map<string, string[]>`, including independent line arrays.
- Use full property paths. Comments before section headers attach to the section; inline comments attach to their own property and emit above it; blank lines preserve association.
- Drop trailing comments, comments targeting arrays, and all comments inside array elements.
- Serialize parsed values into equivalent custom config syntax, including nested objects, object-array sections, bracket arrays, escaped strings, and snake_case/camelCase key conversion. Empty documents and metadata descriptions round-trip.

Validation: task 1 parser/stringifier tests pass; mutating returned comments cannot affect later reads; parse/stringify/parse preserves supported values and comments. Run `cr verify` for each modified source file.

### 3. Merge and normalize configuration documents

Scope: new `src/conf/merge.ts`; use the document types from task 2.

Expected outcome:

- `merge(sources: readonly ConfigDocument[]): ConfigDocument` merges separately parsed objects without mutating inputs: later scalars override, objects merge recursively, arrays append in source order, and comment lines append by full path.
- Deduplicate before stringification, retaining first occurrences. Normalize rule `requires` and command lists before comparing whole rules; compare every field while ignoring object key order.
- Deduplicate verification pre/post and rule command lists by whole-command equality, preserving argument order and repeated arguments within each command. Do not recursively deduplicate command argument arrays. Distinct rules sharing a pattern remain distinct.

Validation: task 1 merge tests cover repeated application, input immutability, equivalent rules with different key order, rules differing in field values, and commands differing in argument order; parsed serialized output matches the normalized merged object. Run per-file source verification.

### 4. Extract reusable settings validation and expose the Conf contract

Scope: `src/conf/load-configuration.ts`, new `src/conf/validate-configuration.ts`, and `src/conf.ts`.

Expected outcome: expose `Conf.validateConfiguration(parsed: ParsedConf): Partial<Configuration>`, throwing on invalid settings without applying runtime defaults, alongside `Conf.merge` and `Conf.stringify` and the agreed types. Reuse the existing settings schema; metadata descriptions remain outside project-settings validation. Preserve global/local/environment/CLI loading, diagnostics, defaults, errors, and existing doctor callers.

Validation: task 1 validation/loading tests and affected existing doctor tests pass; public signatures match DESIGN.md. Run the AGENTS.md per-file verification for every modified source/test file, correcting failures until passing.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- `src/conf.ts`, `src/conf/parse.ts`, `src/conf/load-configuration.ts`, `src/conf/configuration.ts`
- `tests/conf/parse.test.ts`, `tests/conf/load-configuration.test.ts`, configuration callers in `src/commands/doctor/`
- Consumers: tickets 0048 (metadata) and 0049 (persistent project config)

## Implementation and validation

Added isolated full-path comment capture, configuration document serialization,
nonmutating document merging with normalized array/rule deduplication, and shared
settings validation through the Conf facade. Runtime source precedence and
append behavior remain covered independently.

All twelve changed source/test files passed their separate `cr verify` invocations
and the final combined `cr verify -s` invocation. The existing doctor regression
suite passed all 61 tests. `git diff --check` passed.
