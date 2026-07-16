[Medium] A higher-level ignore rule prevents first-use setup

Location: lib/commands/ticket/loop.sh:227
Confidence: high

In a clean legacy repository whose root `.gitignore` already ignores
`.coderail/loop/`, `loop_setup` creates the required local `.gitignore`, but
`git add -- .coderail/loop/.gitignore` rejects that path as ignored. The loop
then exits before invoking the agent even though the planned transcript is
already safely ignored. This violates the first-use requirement to stage newly
created infrastructure and makes the new loop unusable for a realistic prior
log-directory configuration.

Direction: Ensure the exact, newly created infrastructure file can be staged
despite a higher-level ignore rule, while continuing to preserve user-managed
ignore files and checking that the transcript itself is ignored.

[Low] The setup helper reports success after creation errors

Location: lib/utils/loop.sh:8
Confidence: high

If `.coderail/loop` cannot be created (for example, that path is an existing
regular file), `mkdir -p` fails; the ignore-file write then fails too. Because
neither failure is returned, the final `printf true` succeeds and `loop_setup`
returns status 0 while claiming it created the file. The loop's intended
`failed to set up` branch is skipped and failure is deferred to a misleading
staging error; any caller relying on the helper contract alone can proceed
after failed setup.

Direction: Propagate directory and ignore-file creation failures immediately,
and report `true` only after the ignore file was successfully written.

Review scope:
- Reviewed all staged working-tree changes against `HEAD` (`b03f3fe`); there
  were no unstaged changes when review began.
- Inspected the transcript/progress specification, closed implementation
  tickets, README changes, loop/init implementation, shared utility,
  autonomous-review skill, and focused tests.

Validation performed:
- Inspected complete source and documentation diffs plus affected callers,
  scheduler behavior, ticket lifecycle utilities, installation flow, and test
  assertions.
- Reproduced `loop_setup` returning `status=0` and `output=true` when
  `.coderail/loop` is a regular file and both creation operations fail.
- Reproduced `git add -- .coderail/loop/.gitignore` failing after setup when a
  tracked root `.gitignore` contains `.coderail/loop/`; confirmed the planned
  transcript remains ignored.
- Did not rerun tests, per review instructions to assume they pass.

Residual risks:
- Real Codex, Copilot, Claude, and Gemini invocations were not exercised; the
  repository tests use fake agent CLIs.
- Long-running duration formatting and signal interruption were inspected but
  not reproduced.
