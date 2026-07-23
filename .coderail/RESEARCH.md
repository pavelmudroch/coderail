# Research: Work Command Scope

Assigned scope:
- Establish existing command, cleanup, and ticket behavior relevant to a proposed `cr work` command.

Findings:
- `cr` dispatches repository commands from `lib/commands/<name>.sh`; `work` is not yet dispatched.
  - Evidence: `bin/cr`, `run_command` and command allowlist.
  - Confidence: high
- `cr clean` removes all `.coderail` files except `conf.ini` and `test.map`; its ticket readiness rule accepts only closed, satisfied tickets.
  - Evidence: `lib/commands/clean.sh`, stale-file selection and `validate_ticket_readiness`.
  - Confidence: high
- Current `work` scripts are usage-only placeholders, but their help promises a clean worktree on start and no unstaged or untracked files on finish.
  - Evidence: `lib/commands/work/start.sh`; `lib/commands/work/finish.sh`.
  - Confidence: high
- The requested lifecycle has a state conflict unless `work.ini` is committed before finishing or explicitly exempted: start creates it untracked, while finish rejects untracked files.
  - Evidence: requested behavior; start/finish help text.
  - Confidence: high
- The `cr-commit` skill analyzes staged changes and outputs a proposed commit command; it explicitly does not stage files or create a commit itself.
  - Evidence: `instructions/skills/cr-commit/SKILL.md`, “Use staged changes only” and “Output”.
  - Confidence: high

Resolved direction:
- `work.ini` remains committed on the completed work branch but is excluded from the base-branch integration result. Nested work preserves the parent branch's committed `work.ini`.
- Ticket completion uses the existing `cr clean` satisfied-ticket rule for every ticket under `.coderail/tickets`.
- Automatic commit tool selection follows the existing Coderail convention: an optional tool argument, otherwise `default_tool`; no configured default is an error.
- If automatic commit generation or commit execution fails, preserve the cleaned non-Coderail squash result staged on the base branch. Workflow context remains recoverable from the committed work branch.
- If the user declines automatic commit, cleanup removes workflow files while leaving the non-Coderail squash result staged for a manual commit.
- Start may overwrite an existing base-branch `work.ini` in the new child-work branch, enabling nested work. Finish must verify its base branch is completely clean before integration and return to the work branch if it is not.
- Before switching to the base, finish rejects unstaged and untracked files but automatically commits staged work changes with a default message. New work branches remove inherited stale Coderail workflow files before writing their own `work.ini`.
- Nested-work cleanup restores managed workflow files to their exact committed base-branch state, excluding all child Coderail workflow changes from integration.
- Finish captures work-branch workflow context before integration. It resolves conflicts limited to managed Coderail workflow files in favor of the base; any remaining conflict triggers `git reset --merge`, returns to the work branch, and instructs the user to merge the base into that work branch before retrying.
- Start requires a named current branch; detached `HEAD` is rejected because `base_branch` must be switchable by name.

Relevant sources or locations:
- `bin/cr`
- `lib/commands/clean.sh`
- `lib/commands/work.sh`
- `lib/commands/work/start.sh`
- `lib/commands/work/finish.sh`
- `README.md`, “Clean and integrate”

Unresolved questions:
- No material research questions remain; command syntax and parsing details are deferred to specification.
