---
title: "Loop command"
status: "ready"
---

## Outcome

Explore and define the `cr loop` command for the full autonomous implementation
workflow: process ready open tickets, optionally review implementations, and
commit changes so the user can later walkthrough the results and push them.
Behavioral contracts are defined below. Pushing is outside the loop's intended
workflow.

## Current understanding

- `src/commands/loop.ts` is a placeholder: argument parsing and execution are
  no-ops, and help handling is disabled. Its usage text sketches `--limit`,
  `--auto-commit`, `--auto-review`, and an optional harness argument. These are
  existing sketches, not agreed requirements.
- The harness registry supports Claude and Codex. Existing connectors translate
  installation assets; they have no agent-session execution contract.
- Configuration already has `defaultHarness`. Commands receive runtime paths
  and an abort signal through `RunContext`.
- `cr ticket next` selects open tickets in ascending numeric ID order whose
  dependencies are satisfied. Selection currently lives in its command class.
- The implement skill accepts a specific ticket or selects the next ready one,
  activates it, implements and verifies it, and closes it on success. It leaves
  incomplete or failing tickets unclosed and reports unresolved blockers.
- Ticket closure records a reason: `done`, `duplicate` (with a referenced ticket),
  or `dismissed`. The implement skill permits `done` and `duplicate`, so completion
  detection must account for both rather than relying solely on process exit.
- The commit skill only commits initially staged changes and stops when none are
  staged. The loop supplies this staged scope through its end-of-iteration step.
- `cr ticket reopen` moves a closed ticket back to open. Reopening removes its
  closure reason and preserves existing dependencies. Dependents are no longer
  ready until that ticket is completed again.
- A `review` skill does not currently exist in this repository. The user will
  create it manually; its implementation is outside this idea. Treat it as an
  available skill satisfying the agreed invocation/findings contract.

## Agreed workflow

After startup checks and successful preflight of all enabled stages, use the
following orchestration. Preflight runs once per distinct effective model/effort
combination per run, before the first implementation.

1. Select the next ready ticket.
2. Invoke the harness with a prompt calling the `implement` skill and referencing
   the selected ticket file. The agent owns activation, implementation,
   verification, fixes, iteration, and closing the completed ticket.
3. Require both successful harness completion and closure of the selected ticket.
   Stop the loop if either check fails.
4. If `--auto-review` is enabled, invoke the harness with the future `review`
   skill to review the current iteration's unstaged changes and new untracked
   files, using the selected ticket as context. Findings become new tasks on the
   original ticket, which is reopened, or a new ticket.
5. Stage the current changes with Git, regardless of `--auto-commit`.
6. If `--auto-commit` is enabled, invoke the harness with the `commit` skill.
7. Select the next ready ticket again and repeat until no ready ticket remains
   or `--limit` is reached.

This ordering places commit after review, including when review creates
follow-up work. Follow-up work returns through ticket selection rather than
being fixed directly by the review invocation.

## Agreed CLI behavior

- Review and commit are independent opt-in features, both disabled by default.
- `-r` / `--auto-review` enables review.
- `-c` / `--auto-commit` enables commit. End-of-iteration staging is unconditional.
- Combined short flags are supported: `cr loop -rc` enables both review and
  commit, with review preceding staging and commit.
- Plain `cr loop` performs implementation without automatic review or commit.
- Every loop invocation requires the initialized Coderail project subtree to be
  clean at startup: no staged, unstaged, or untracked changes, regardless of
  review and commit flags. Outside unstaged/untracked changes are allowed.
- With `--auto-commit`, additionally reject staged changes outside that subtree
  at startup, because the commit skill consumes the shared Git index. Without
  automatic commit, outside staged changes may remain and must be preserved.
- Cleanliness is checked at startup, not before every iteration. Without
  automatic commit, staged changes accumulate across iterations during the run.
- Failure preserves the resulting worktree and index for inspection rather than
  rolling changes back. A failed run may leave a dirty worktree; the user must
  resolve it before starting another run.

## Agreed change boundaries

- At the end of each successful iteration, after optional review, the loop stages
  the current changes, including new files and ticket updates.
- Without automatic commit, the index represents accumulated work from previous
  iterations. New unstaged changes represent the current iteration relative to
  that staged baseline, even when the same file changes in multiple iterations.
- Review targets the current iteration's unstaged changes and new untracked
  files. Prior staged work remains available as context.
- Implementation and review must preserve the staged baseline for this boundary
  to work; the loop owns the end-of-iteration staging step.

## Agreed review findings behavior

- The review agent decides whether a finding needs an immediate fix or can wait.
- For fixes needed immediately, it adds actionable tasks to the original ticket
  and reopens it. Implementation remains the responsibility of a subsequent
  implementation invocation.
- For fixes that can wait, such as minor typos, it creates a follow-up ticket
  instead of reopening the original. This choice is based on urgency, not solely
  on whether a finding falls within the original ticket's scope.
- Review findings themselves are expected workflow results, not implementation
  failure: after successful review, the loop stages changes, optionally commits,
  and returns to ticket selection.

## Agreed iteration limit

- Each loop iteration counts as one implementation attempt toward `--limit`,
  including another attempt on a reopened ticket.
- Review and commit invocations within that iteration do not count separately.
- The limit does not interrupt the current iteration's review, staging, or commit
  stages. For example, `cr loop --limit 1 -rc` completes one implementation,
  review, staging, and commit cycle, then stops even if review reopened the ticket.

## Agreed failure handling

- Hard stop if any harness invocation or Git staging/commit operation fails.
- Stop if implementation reports successful harness completion but the selected
  ticket was not closed. Do not execute later stages after a failure.
- Successful implementation requires successful harness completion and closure
  of the selected ticket with reason `done` or `duplicate`. Closure as `dismissed`
  is unexpected and stops the loop.
- Preserve the worktree and index in their resulting state for user inspection.
  Do not roll back or automatically retry/recover.
- Review findings that are successfully recorded as ticket work are normal
  results, not a failed review invocation.
- A possible future `--auto-fix` flag could invoke a separate agent to repair
  the current state and permit continuation. It is deferred and outside this
  version's scope; no recovery mechanism is required now.

## Agreed organization

Keep the workflow in one idea because implementation, review, fixes, commit,
and ticket completion share iteration boundaries and failure semantics. Use
multiple implementation tickets once the design is ready.

## Agreed session boundaries

Every harness prompt invocation starts a fresh session, including implementation,
review, and commit. No conversation context is carried between invocations or
iterations. Prompts and referenced repository artifacts must supply the context
needed for each stage.

## Agreed harness selection

- An optional positional harness explicitly selects the harness for the run,
  for example `cr loop codex -rc`.
- Otherwise use configured `defaultHarness`, matching install/uninstall behavior.
- Missing or unknown selection fails before work starts.
- Use the same selected harness for implementation, review, and commit.

## Agreed execution permissions

- Inherit the selected harness's configured permissions and sandbox. Do not
  automatically elevate permissions or bypass its configured restrictions.
- Sessions run non-interactively. Permission restrictions that prevent successful
  completion follow the agreed hard-stop failure rules.
- A possible future `--sandbox` flag could run a harness with full permissions
  inside a limited container, with read-only tools and read-write access to the
  current repository. This container-based execution model and flag are outside
  the current scope.
- For this idea, assume the harness cannot touch files outside the initialized
  Coderail project directory used as its working directory. Enforcement belongs
  to a separate sandboxing idea. Do not add outside-change detection, isolation,
  or enforcement to this implementation.

## Agreed output and interruption

- Keep loop lifecycle logging separate from agent output. Do not include agent
  output in terminal lifecycle logs; stream it to files for live inspection with
  tools such as `tail -f`.
- Show a Preflight section, followed by numbered Iteration sections. Each
  iteration identifies the selected ticket ID and title. Use the existing
  spinner for the active step (`Implementing...`, `Reviewing...`, `Staging...`,
  `Committing...`) instead of separate static step headings. Print a permanent
  step completion line with status and elapsed duration; the spinner redraws
  beneath it and changes its message for the next step. End with an iteration
  completion line. Preflight also has an explicit completion/status line.
- Include staging in step reporting. Use `Iteration N complete`, rather than
  claiming the ticket is complete: successful review may reopen the ticket.
  Completion lines must identify their context when headers are suppressed.
- Under `--quiet`, show only completion lines with success/failure status.
  Include context on those lines so they remain understandable without headers.
  Failure completion lines include the failed step and a short reason.
- End the run with `Loop complete [ ok | fail ]`, including attempt count,
  stop reason, and any unfinished ticket. Ordinary stops such as the iteration
  limit are successful outcomes.
- Quiet-mode completion lines are an agreed exception to the existing global
  help description of quiet as errors only. Update documentation accordingly.
- Additional verbose diagnostics are optional implementation freedom; resolved
  settings, output paths, and commit IDs are useful candidates.
- Reuse existing non-interactive behavior: disable spinner animation when the
  terminal is non-interactive, while retaining permanent completion lines.
- On Ctrl+C, cancel the active harness, stop the loop, and preserve changes.
  Do not start any later stage or iteration.
- End with a short summary of attempt count, stop reason, and any unfinished
  ticket.

Example permanent output and active spinner (the spinner line is transient):

```text
Preflight:
  Validate codex model=… effort=…
Preflight complete [ ok ]

Iteration 1: ticket 0042: Add configuration support
  Implement complete [ ok ] · 2m 32s
  Review complete [ ok ] · 48s
  Stage complete [ ok ] · 1s
  ⠙ Committing...
```

After commit finishes, replace the active spinner with permanent output:

```text
  Commit complete [ ok ] · 7s
Iteration 1: ticket 0042 complete [ ok ] · 3m 28s
Loop complete [ ok ] · 1 attempt · iteration limit reached
```

## Agent output file design

Loop command logging above is agreed. Agent output uses the minimal per-ticket
contract below and the agreed iterable runner interface.

- Agreed run output location: `.coderail/loop/<run-id>/`.
- Use a `.coderail/.gitignore` managed by `cr init` instead of modifying the
  repository-root `.gitignore` or Git's local exclude file. Ignore runtime
  content while retaining `.gitignore`, `config`, `plans/`, and `tickets/`.
  Git investigation confirms that `!plans/` and `!tickets/` alone leave their
  contents ignored by `*`; include recursive exceptions as well. Agreed content:

  ```gitignore
  *
  !.gitignore
  !config
  !plans/
  !plans/**
  !tickets/
  !tickets/**
  ```

  `cr init` creates this file when missing and repairs existing files while
  preserving custom content. Ensure `*` is the first line: prepend it when it
  is not already first, even if it appears elsewhere. Append any missing
  required exception lines at the end. Repeated initialization must not keep
  adding lines once these requirements are satisfied. Users of existing
  initialized projects rerun `cr init` to create or repair the file. `cr loop`
  does not invoke init automatically.
  Extend the shared initialized-project check in `findRepositoryRoot` in
  `src/runtime/context.ts`: require a `.coderail` directory and a
  `.coderail/.gitignore` containing the required lines above. `cr loop` must
  declare `requiresInit = true`, using this shared check before starting agent
  sessions or creating runtime output. This initialization requirement applies
  to all commands requiring an initialized project, not only loop.
  Stop discovery at the nearest `.coderail` directory. If its ignore file is
  missing or incomplete, do not continue to an initialized parent project;
  commands requiring initialization must report that this nearest project
  needs `cr init`. Commands such as `cr init` must remain runnable without a
  fully initialized project so users can repair initialization.
  Validation is deliberately minimal: require `*` as the first line and the
  required exception lines to be present. Allow additional custom lines;
  do not interpret arbitrary Git ignore patterns or detect conflicting rules.
- Agreed run ID: UTC start timestamp plus a short random suffix, for example
  `20261110T143052Z-a7c2f9`, giving sortable names and avoiding collisions.
  The run ID identifies one `cr loop` invocation, including its preflight and
  all implementation attempts.
- Write agent output directly beneath `.coderail/loop/<run-id>/`:
  `preflight.jsonl` contains all preflight probes; `<ticket-id>.jsonl` contains
  implementation, review, and commit output for that selected ticket. Repeated
  attempts on the same ticket append to its file within the run. Do not create
  per-step or per-attempt directories, separate stdout/stderr logs, or a readable
  activity file in this version.
- Each line is a JSON object with this agreed shape:

  ```ts
  {
      timestamp: string;
      step: 'preflight' | 'implement' | 'review' | 'commit';
      stream: 'stdout' | 'stderr';
      output: string;
  }
  ```

  Keep this minimal schema; no additional ticket, attempt, or probe fields are
  currently required. Native stderr need not be JSON: `output` is a string.
  Timestamp is a UTC ISO 8601 string with millisecond precision recording when
  output is received, for example `2026-11-10T14:30:52.123Z`. Preserve native
  stream text as decoded chunks, JSON-escaped without parsing/reformatting
  native events or waiting for complete lines. Write records immediately for
  live inspection.
  Connectors expose timestamped output messages through an async iterable
  runner returned by `run`. The loop consumes the runner with `for await`,
  adds the current `step`, and appends records to the appropriate JSONL file.
  Async disposal and successful completion/final-answer access follow the
  agreed runner contract below.
- Git ignore rules do not untrack existing files. Initialization creates or
  repairs ignore rules only; existing tracked content remains tracked. Each
  loop invocation writes its output beneath its new unique run directory.

## Agreed model and effort settings

Model and effort must be configurable in a configuration file so routine runs
do not require flags. Per-stage selection is in scope for design. Exact public
options, configuration shape, precedence, and early validation are agreed below.

- Codex supports `--model` and a `model_reasoning_effort` configuration override.
- Claude supports `--model` and `--effort`.
- Effort availability depends on the selected model and installed client version.
  Equal effort labels do not promise equal reasoning budgets across providers.
- Normalize option names and stage ownership, while
  preserving harness-native model IDs/aliases and effort values. Do not invent
  cross-provider model aliases or silently translate unsupported effort levels.
- The CLI uses a mount-style option list: `-o
  model=gpt-6.1-sol,effort=medium,commit-model=gpt-6.1-terra,commit-effort=low`.
  This keeps help compact and encourages configuration-file use for saved
  preferences. Individual model/effort flags are not the selected design.
- Supported option keys:
  - `model`: default model for all operations.
  - `effort`: default effort for all operations and models.
  - `implement-model`: model override for implementation.
  - `implement-effort`: effort override for implementation.
  - `review-model`: model override for review.
  - `review-effort`: effort override for review.
  - `commit-model`: model override for commit.
  - `commit-effort`: effort override for commit.
- Model and effort resolve independently using this agreed precedence, highest
  first:
  1. Step-specific CLI option.
  2. Common CLI option.
  3. Step-specific configuration.
  4. Common configuration.
  5. Native harness default.
- A common CLI value overrides even configured per-stage values. This lets users
  control the run without knowing saved configuration exceptions. For example,
  `-o model=gpt-6.1-sol` overrides a configured `commit-model`; an explicit
  `commit-model` in the same invocation can establish a CLI exception.
- Configuration uses harness-specific sections, `[loop.codex]` and
  `[loop.claude]`. Each accepts `model`, `effort`, `implement_model`,
  `implement_effort`, `review_model`, `review_effort`, `commit_model`, and
  `commit_effort`, following existing underscore-based configuration conventions.
  Only the selected harness's section applies.
- Example agreed shape:

  ```toml
  [loop.codex]
  model = "gpt-6.1-sol"
  effort = "medium"
  commit_model = "gpt-6.1-terra"
  commit_effort = "low"

  [loop.claude]
  model = "opus"
  effort = "high"
  commit_model = "haiku"
  ```

- Validate effective model/effort settings for all enabled stages before the
  first implementation starts, so a bad review or commit setting fails early.
  Syntax-only checks followed by deferred validation on each stage's execution
  do not satisfy this requirement. Use the no-work preflight below.

Investigation sources:

- Local `codex --help` and `claude --help`.
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference).
- [Claude model configuration](https://code.claude.com/docs/en/model-config).

Preflight rationale and agreed contract:

- Codex App Server documents `model/list`, including available models and
  supported reasoning efforts. Account/client/provider context affects results:
  [App Server models](https://learn.chatgpt.com/docs/app-server#models).
- Claude documents that `--model` does not reject a mistyped ID at startup; the
  first request reports the problem. Custom providers also accept native names:
  [Claude model configuration](https://code.claude.com/docs/en/model-config).
- Agreed approach: validate distinct effective model/effort combinations for
  enabled stages through lightweight no-work preflight requests before
  implementation. Extra startup model requests are accepted; identical
  combinations are checked once per run. Each request is a fresh session using
  the selected harness and effective model/effort in the initialized project cwd.
- Use the shared prompt:
  `Do not use tools or read or modify files. Reply with exactly: OK`.
  Require successful session completion and a final answer whose trimmed text
  is exactly `OK`; any failure/unexpected answer stops before implementation.
- A successful probe establishes that the combination can complete a request;
  it does not prove that the provider applies an effort value exactly as intended
  or rule out native model fallback. Avoid claiming more than the harness exposes.
- Reuse `run` with the validation prompt. The runner must expose the final
  message so the loop can check the exact `OK` response. The earlier direct
  final-message return is superseded by the iterable runner direction below;
  its agreed completion API is `Runner.result()`. Execution failure or
  cancellation must reject rather than indicate success.
- The loop owns resolving/deduplicating enabled-stage combinations, invoking
  `run` with a shared no-work validation prompt, checking the final response,
  and completing all probes before implementation. Normal stages may ignore
  the returned final message. No dedicated connector validation method is needed.
- Use one shared prompt. Native invocation/output handling stays inside each connector.
  Probe safety relies on the no-work prompt and inherited harness restrictions;
  no separate tool-disable execution contract is proposed with this minimal
  `run` interface, and general sandbox implementation remains out of scope.

## Remaining implementation freedom

Private helper organization, native CLI argument/output-event handling, parser internals,
diagnostic wording, and test fixture organization remain implementation choices
within the agreed behavior. No further idea decomposition is required.

## Agreed command structure and execution signature

- `src/commands/loop.ts`: CLI parsing/help, startup checks, and summary reporting.
- `src/commands/loop/run-loop.ts`: iteration ordering, stage transitions,
  completion checks, limits, and failure propagation.
- `src/commands/loop/git.ts`: clean-worktree check and end-of-iteration staging.
- `src/commands/init.ts`: create or repair `.coderail/.gitignore` alongside the
  existing initialization work. `src/runtime/context.ts`: validate the agreed
  initialization requirements at the nearest project boundary, preserving the
  ability to run commands that do not require initialization. Private helpers
  for sharing the required ignore lines remain implementation freedom.
- Agreed execution signature: `run({ cwd, prompt, model?, effort?, signal }):
  Promise<Runner>`. Each call launches a fresh session. The returned runner
  streams messages through `AsyncIterable<Message>`. This replaces the earlier
  direct final-message return; `Runner.result()` supplies the final answer
  for the agreed preflight check. Ticket/Git postconditions stay in the loop.

The public connector method uses these fields:

```ts
run(request: {
    cwd: string;
    prompt: string;
    model?: string;
    effort?: string;
    signal: AbortSignal;
}): Promise<Runner>;

type Message = {
    timestamp: string;
    stream: 'stdout' | 'stderr';
    output: string;
};

interface Runner extends AsyncDisposable, AsyncIterable<Message> {
    result(): Promise<{ finalMessage: string }>;
}
```

- The loop uses `await using` for the runner, consumes messages with
  `for await`, then awaits `result()`. Iteration finishes normally only after
  successful harness completion and draining stdout/stderr. Execution failure
  or cancellation throws. A log-write failure exits the scope and disposes the
  runner, stopping the active process rather than continuing without logging.
- Async disposal stops any still-running subprocess and awaits termination and
  cleanup. Disposal after completion is harmless. The request's abort signal
  remains responsible for Ctrl+C cancellation.
- `finalMessage` is the final assistant answer extracted from the native
  harness protocol, not the last stdout chunk or protocol line. Connectors own
  parsing this answer and determining successful harness completion. Raw output
  remains available unchanged through the iterator. Preflight checks the answer
  for exactly `OK` after trimming; other stages normally ignore the answer and
  check ticket/Git postconditions.

## Agreed harness integration

- Reuse `HarnessConnector` by adding `run`, rather than introducing separate
  runners. Define the run request type and required method in
  `src/harness/connector.ts`, implement execution in
  the existing `src/harness/codex.ts` and `src/harness/claude.ts`, and reuse the
  existing `Harness` registry. Define `Runner` and `Message` alongside the run
  request in `src/harness/connector.ts`. No separate execution-connector
  interface, registry, or per-harness runner files are needed.
- Execution uses the request's `cwd`, independent of installation `home` and
  installation scope. Preserve native harness configuration/permission loading;
  do not repurpose installation `home` as the agent's runtime configuration root.

## Agreed supporting structure

- Extract ready-ticket selection from `src/commands/ticket/next.ts` into
  `src/commands/ticket/helpers/get-ready-tickets.ts` for shared use by the ticket
  command and loop; preserve existing numeric ordering/dependency behavior.
- Extend existing configuration types/loading with the agreed loop sections.
- Treat the manually supplied review skill as a prerequisite. Do not create or
  implement it as part of this idea. Align implementation prompts/instructions
  with the index-preservation boundary and pass the agreed context to review.

Local `codex exec --help` and `claude --help` confirm non-interactive launch
surfaces (`codex exec` and `claude --print`) with model selection. Installed
clients expose different output/event formats, which the connectors own.

## Agreed edge-case contracts

- Preserve `cr ticket next` selection semantics: ascending numeric ID among
  dependency-ready open tickets. Review-created follow-ups are eligible in the
  same run. Without `--limit`, impose no additional iteration/reopen cap.
- When no ticket is ready, stop normally and distinguish an empty queue from
  remaining blocked work in the summary.
- Accept review based on successful session completion and valid resulting
  ticket state; do not require a separate machine-readable findings protocol.
  Review records tasks/tickets and does not fix implementation files itself.
- After commit, require a successful session, at least one new commit when
  staged changes existed, and a clean project scope. Skip commit invocation
  when staging produces no staged diff rather than creating an empty commit.
- Reject unknown option keys, malformed entries, and empty model/effort values.
  Preserve native model/effort strings. Model/effort compatibility must also be
  validated for enabled stages before the first implementation, as noted above.
- Merge global/project loop configuration by harness and individual setting,
  with project values replacing matching global values and preserving omitted
  global settings. Then apply the agreed CLI precedence.
- Resolve execution/ticket paths from the initialized project root. Limit Git
  cleanliness checks, review scope, and staging to that subtree, with the
  additional outside-index startup restriction when automatic commit is enabled.
  Preserve allowed pre-existing outside changes.

## Agreed verification expectations

- Test CLI parsing, combined flags, option validation, and every settings
  precedence level, including global/project per-key merging.
- Exercise loop stage ordering, reopening/follow-up selection, limits, all
  failure boundaries, and cancellation using fake harness execution.
- Use temporary Git repositories to verify dirty-start rejection, staged versus
  unstaged boundaries across iterations, new files/deletions, and commit checks.
- Cover nested initialized projects: allow outside unstaged/untracked changes,
  preserve outside staged changes without automatic commit, reject them with
  automatic commit, and stage/review only the initialized subtree.
- Test both connectors with fake executables for argument translation, fresh
  session launches, streamed output, failure detection, and cancellation without
  requiring authenticated model calls.
- Cover runner async disposal after normal completion and early exit, final
  answer extraction independently of trailing protocol events, log-write failure,
  and per-ticket/preflight JSONL routing, appending, and UTC timestamps.
- Test init creation and idempotent repair of ignore rules, preservation of
  custom content, and nearest-project discovery with incomplete initialization.
  Cover `*` prepending, missing exception appends, minimal validation with custom
  lines, and the ability to run init when initialization is incomplete.
- Cover preflight success/failure/unexpected answers, distinct-combination
  deduplication, disabled-stage exclusion, and completion of all validations
  before the first implementation starts.
- Test loop integration with an assumed review skill using fake clean-review,
  immediate-fix, and deferred-follow-up outcomes; review skill implementation
  and testing are outside this idea.
- During implementation, run `cr verify` for each modified source/test file as
  required by the repository instructions.

## References

- `src/commands/loop.ts`
- `src/commands/ticket/next.ts`
- `src/commands/ticket/close.ts`
- `src/commands/ticket/reopen.ts`
- `src/commands/ticket/helpers/are-dependencies-satisfied.ts`
- `src/commands/ticket/helpers/resolve-ticket.ts`
- `src/harness.ts`
- `src/harness/connector.ts`
- `src/conf/configuration.ts`
- `src/commands/helpers/command.ts`
- `src/runtime/context.ts`
- `src/runtime/signals.ts`
- `assets/instructions/skills/implement/SKILL.md`
- `assets/instructions/skills/commit/SKILL.md`

## Readiness

Loop lifecycle logging, per-ticket JSONL files, a separate preflight JSONL file,
and the timestamp/framing contract above are agreed. The iterable runner,
async disposal, separate final-answer result, initialization repair, and minimal
nearest-project validation are agreed. Outcome, boundaries, behavioral contracts,
module ownership, public execution interfaces, and verification expectations
are sufficiently defined for implementation. Remaining choices are private
implementation details described above.

The review skill is an assumed user-supplied prerequisite; sandbox enforcement
and automatic recovery are deferred. No implementation tickets or source/test
changes have been made.
