---
id: "0026"
slug: "restore-rejected-promises-for-invalid-claude-global-instructions"
title: "Restore rejected promises for invalid Claude global instructions"
status: "closed"
created_at: "2026-11-07T13:40:41.742Z"
updated_at: "2026-11-07T13:49:35.291Z"
dependencies:
  - "0023"
reason: "done"
---

# Restore rejected promises for invalid Claude global instructions

Restore the promise contract of `ClaudeConnector.translateGlobalInstructions()`.
The current `Promise.resolve([...])` evaluates `translateText()` before returning,
so invalid UTF-8 throws synchronously instead of producing a rejected promise.

## Tasks

1. [x] Preserve the existing rejected-promise regression assertion
2. [x] Defer global instruction translation into the returned promise
3. [x] Verify the modified source and any modified tests

## Task details

### 1. Preserve the existing rejected-promise regression assertion

Scope: inspect the `Claude rejects invalid UTF-8 Markdown at every instruction
location` test in `tests/harness/claude.test.ts`.

Expected outcome: retain the direct
`expect(connector.translateGlobalInstructions(...)).rejects.toThrow('AGENTS.md')`
assertion. It must exercise the method returning a promise without wrapping a
synchronous throw or weakening the expected error behavior. Reuse this regression
test; additional tests are unnecessary unless an uncovered behavior requires one.

Validation: the existing assertion catches the synchronous-throw regression and
passes after task 2. Valid translation expectations continue to cover output bytes.

### 2. Defer global instruction translation into the returned promise

Scope: `ClaudeConnector.translateGlobalInstructions()` in `src/harness/claude.ts`.

Expected outcome: use `Promise.resolve().then(() => [...])` or equivalent async
evaluation so decoding/translation failures reject the returned promise. Preserve
the `rules/coderail.md` destination, valid translated bytes, and source-path error
message. Keep this a focused change to the global instruction method.

Validation: task 1's unchanged rejected-promise assertion and existing successful
global instruction translation assertions pass.

### 3. Verify the modified source and any modified tests

Scope: verification required by `AGENTS.md` for files modified during this ticket.

Expected outcome: run `cr verify ./src/harness/claude.ts`. If the test file is
modified, also run `cr verify ./tests/harness/claude.test.ts`. Ensure the existing
Claude regression assertion executes through the appropriate check; if source
verification does not exercise it, run the focused Claude test verification too.
Fix failures and repeat until all required checks pass.

Validation: record successful commands and results in the implementation handoff.

## References

- [Agreed review changes](../../plans/codex-harness-connector/REVIEW.md)
- [0023 — Claude installation prerequisite](../closed/0023-implement-functional-claude-harness-installation.md)
- `src/harness/claude.ts` — `translateGlobalInstructions()` and `translateText()`
- `tests/harness/claude.test.ts` — existing invalid UTF-8 rejected-promise assertion
- `src/harness/connector.ts` — promise-returning connector contract
- `AGENTS.md` — required verification for modified source/test files
