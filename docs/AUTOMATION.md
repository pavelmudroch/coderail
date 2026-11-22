# Automated implementation

[Overview and workflow](../README.md) · [Installation](INSTALLATION.md) · [Commands and configuration](COMMANDS.md) · [Automation](AUTOMATION.md)

## Start orchestration

Initialize your Git project with `cr init` and configure its verification rules.
Install or refresh the CodeRail skills with `cr install codex` or
`cr install claude`. Add `--local` to install for the initialized project.

Open an agent session in the project with subagent support enabled. Invoke
`$orchestrate` in Codex or `/orchestrate` in Claude. The skill delegates
implementation and review and commits approved ticket changes, so the session
needs permission to run project checks and make local Git commits.

## How tickets are processed

1. The orchestrator uses `cr ticket next --json` to find open tickets whose
   dependencies are satisfied.
2. It assigns one ticket per implementation subagent and runs independent work
   in parallel when the changes and verification can run safely together.
3. A separate review subagent checks each completed ticket. Required in-scope
   corrections reopen the ticket for another implementation attempt.
4. The orchestrator stages approved ticket changes and invokes the commit skill.
   It serializes staging and commits that share a Git index and preserves
   unrelated changes. Pushing remains under your control.

The orchestrator rechecks ticket availability as work progresses. It reports
completed tickets, commits, remaining work, and blockers when it finishes or
needs your input. The agent session holds orchestration progress. If interrupted,
check ticket state and the Git working tree and index before resuming.

## Upgrade from the CLI workflow

Invoke the skill from your agent session when upgrading from `cr loop`. CodeRail
ignores legacy `[loop]` settings in project and global configuration. Configure
model and reasoning preferences in your agent harness.
