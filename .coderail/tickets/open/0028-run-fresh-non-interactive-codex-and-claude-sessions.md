---
id: "0028"
slug: "run-fresh-non-interactive-codex-and-claude-sessions"
title: "Run fresh non-interactive Codex and Claude sessions"
status: "open"
created_at: "2026-11-10T09:06:46.766Z"
updated_at: "2026-11-10T09:06:46.766Z"
dependencies: []
---

# Run fresh non-interactive Codex and Claude sessions

Extend the existing harness connectors with a streaming execution contract so
loop stages can run fresh sessions, inspect final answers, cancel work, and
release child processes reliably. Deliver both native connectors together so
the required interface remains implemented by every registered harness.

## Tasks

1. [ ] Add fake-executable execution and protocol tests for both harnesses
2. [ ] Add runner lifecycle, cancellation, and disposal tests
3. [ ] Define the shared execution contract and implement Codex execution
4. [ ] Implement Claude execution using its native protocol
5. [ ] Verify execution and existing installation compatibility

## Task details

### 1. Add fake-executable execution and protocol tests for both harnesses

Scope: `tests/harness/codex.test.ts`, `tests/harness/claude.test.ts`, and focused
fake executable fixtures as needed. Use no authenticated services.

Expected outcome: assert fresh non-interactive launches (`codex exec` and
`claude --print`), prompt/cwd/signal handling, optional native model and effort
translation, inherited configuration and permissions, and execution cwd being
independent of installation home/scope. Exercise omitted settings and native
strings without aliases or silent effort translation. Capture raw stdout/stderr
chunks, including partial lines, Unicode split across byte chunks, and native
non-JSON stderr. Fixtures independently specify native success/failure events.

Validation: each run launches a new session without resume/context carryover.
Raw text survives streaming unchanged, with receipt timestamps in UTC ISO 8601
millisecond format. Final-answer assertions extract the actual final assistant
answer even when trailing protocol events follow it; the last chunk is not used
as a substitute. Cover launch failures, nonzero exit, and native failure events.

### 2. Add runner lifecycle, cancellation, and disposal tests

Scope: the same connector suites, using controllable long-running fake processes.

Expected outcome: draining both streams and successful process completion are
required for normal iteration completion. `result()` rejects execution failure
or cancellation. Abort before/during execution stops work. Async disposal after
early exit stops and awaits the process and cleans up streams/resources; disposal
after normal completion is harmless.

Validation: tests prove no child continues after disposal or cancellation,
stdout/stderr are drained on success, errors do not become successful results,
and failure paths have no leaked-resource or unhandled-rejection diagnostics.

### 3. Define the shared execution contract and implement Codex execution

Scope: `src/harness/connector.ts`, `src/harness/codex.ts`, necessary exports in
`src/harness.ts`, and compile-required existing connector test doubles.

Expected outcome: add required `run({ cwd, prompt, model?, effort?, signal }):
Promise<Runner>` to `HarnessConnector`, with request types and these public shapes
alongside it:

```ts
type Message = { timestamp: string; stream: 'stdout' | 'stderr'; output: string };
interface Runner extends AsyncDisposable, AsyncIterable<Message> {
    result(): Promise<{ finalMessage: string }>;
}
```

Implement Codex's native invocation, incremental stream decoding, protocol-based
success/final-answer extraction, abort handling, and async cleanup. Preserve
installation translation and synchronous connector disposal contracts. Update
interface documentation that currently describes translation-only connectors.
Do not add another execution registry, connector interface, or per-harness runner
files; use private helpers if useful. Task 4 completes the interface for Claude.

Validation: Codex cases from tasks 1–2 pass. Execution never repurposes installation
home as the runtime configuration root or adds permission elevation/bypass flags.

### 4. Implement Claude execution using its native protocol

Scope: `src/harness/claude.ts`, implementing the same shared contract.

Expected outcome: launch a fresh native print session, translate native model and
effort options, parse successful completion and final answer independently from
raw message streaming, and implement the lifecycle guarantees from task 2.
Preserve native permission/configuration loading and all installation behavior.

Validation: Claude cases from tasks 1–2 pass, with the same runner semantics as
Codex and no authenticated model calls. Harness registry selection remains shared
between installation and execution.

### 5. Verify execution and existing installation compatibility

Scope: changed source/test files and affected install/uninstall test doubles.

Expected outcome: all registered connectors satisfy the required method and
existing installation tests continue to work without spawning sessions. Record
verification commands/results in implementation notes.

Validation: run `cr verify ./src/<path-to-file>.ts` for every modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for every modified test file; fix
failures and repeat until passing. Tests cover both native protocols using fakes.

## References

- [Approved execution signature](../../plans/loop-command/IDEA.md#agreed-command-structure-and-execution-signature)
- [Harness integration](../../plans/loop-command/IDEA.md#agreed-harness-integration)
- [Permissions and session boundaries](../../plans/loop-command/IDEA.md#agreed-execution-permissions)
- [Connector contract](../../../src/harness/connector.ts)
- [Codex connector](../../../src/harness/codex.ts)
- [Claude connector](../../../src/harness/claude.ts)
- [Harness registry](../../../src/harness.ts)
- [Repository verification instructions](../../../AGENTS.md)
- Existing installation delivery: closed tickets 0023 and 0024.
- Consumer: ticket 0030; log framing and preflight policy belong to the loop.
