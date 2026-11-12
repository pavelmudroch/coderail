# Loop command review

## Agreed changes

- [ ] Stop the harness session's process tree on cancellation, async disposal,
  early iterator exit, and execution/logging failure. Update
  `src/harness/runner/runner.ts` so descendant tool processes cannot continue
  work or hold inherited output pipes open indefinitely after the harness is
  stopped. Add regression coverage with a harness that spawns a child; assert
  descendant termination, settled runner cleanup, and rejected completion.
- [ ] Restore the agreed lifecycle output layout in
  `src/commands/loop/run-loop.ts`: `Preflight:` and validation details, an overall
  `Preflight complete [ ok | fail ]` line, ticket iteration headings, indented
  `Implement/Review/Stage/Commit complete [ ok | fail ]` lines with readable
  durations such as `2m 32s`, and
  `Iteration N: ticket ID complete [ ok | fail ]` summaries. Keep detailed step
  failure reasons and the final attempt count, stop reason, and unfinished ticket
  when applicable. Preserve spinner behavior and agent-output separation.
  Route the final `Loop complete [ ok | fail ] ...` summary through `Log.output`
  in every logging mode; route iteration completion/status summaries through
  `Log.info` (normal and verbose only); route all other permanent lifecycle
  lines through `Log.notice` (verbose only). This replaces the earlier agreement
  to retain all step completion lines in quiet mode. Update reporting tests to
  assert formatting, preflight aggregation, failure summaries, and routing in
  normal, quiet, verbose, and non-interactive modes. Run the required per-file
  verification for modified source and test files for both fixes.

## Agreed startup decision

Without automatic commit, accept existing staged project changes and reject
unstaged/untracked project changes. This permits restarting a loop without an
intervening commit. With automatic commit, retain the clean-project requirement
and rejection of outside staged changes. The staged implementation and help
reflect this decision; IDEA.md has been aligned with it.

The walkthrough of this startup change was completed and confirmed by the user
on 2026-11-12, with no new implementation tasks. Existing review tasks above
retain their recorded status.

## Deferred documentation

- README updates remain deferred: remove the stale statement that loop CLI
  parsing and execution are unimplemented, and align output documentation/help
  with the revised logging levels when documentation is updated.
