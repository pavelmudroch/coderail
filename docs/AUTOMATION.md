# Coderail workflow and automation

[Overview and workflow](../README.md) · [Installation](INSTALLATION.md) · [Commands and configuration](COMMANDS.md) · [Automation](AUTOMATION.md)

The ideal Coderail workflow moves through **design**, **implementation**, and
**acceptance**. Ideas capture the user's intent, specifications set expectations,
and tickets define the work that orchestration carries out. A work branch can
hold the records and commits from all three phases, giving aggregate review a
single comparison against the original branch. Git handles integration after
the user accepts the work.

## Complete workflow

| Phase | Step | Action |
| --- | --- | --- |
| Setup | Initialize the repository | Run `cr init` once per repository. |
| Work management | Establish work context | Run `cr work` before starting a task. |
| Work management | Start work | Run `cr work start <work-name>` for a substantial change. |
| Design | Explore | Build an idea tree with the agent. |
| Design | Specify | Turn agreed ideas into specifications. |
| Design | Plan | Create actionable tickets with dependencies and acceptance criteria. |
| Implementation | Implement | Invoke orchestration. |
| Acceptance | Review complete work | Review the work branch against its base. |
| Acceptance | Publish | Push the work branch and create a pull request. |
| Acceptance | Accept | Review the pull request, merge, and clean up the branch. |

## 1. Initialize

Run `cr init` as a one-time repository setup and configure the project's
verification rules. Establish agent guidance by installing the Coderail skills
and subagents with `cr install codex` or `cr install claude`. Add `--local` to
install for the initialized project. Use the same install command to refresh the
agent instructions.

## 2. Establish work context

The agent runs `cr work` before starting a new task and uses the current branch
and upstream to decide how to proceed.

- If already on a work branch, continue the existing work.
- For a small, isolated change, working directly on the current branch is an
  option.
- For a substantial change, run `cr work start <work-name>` from a clean local
  branch. The new work branch tracks the branch it started from.

Ideally, start the work branch before exploring ideas so that any committed
specifications and tickets are included in the work. See
[work branches and review ranges](COMMANDS.md#review-work).

## 3. Design collaboratively

The user and agent explore the problem, build an idea tree, discuss alternatives,
and resolve design decisions together. **The user controls what is being built
and why.**

Once they agree on a direction, the agent turns the ideas into specifications
for the user to validate, then creates actionable tickets with explicit
dependencies and acceptance criteria.

## 4. Orchestrate implementation

Open an agent session in the project with subagent support enabled. Invoke
`$orchestrate` in Codex or `/orchestrate` in Claude. The skill delegates
implementation and review and commits approved ticket changes, so the session
needs permission to run project checks and make local Git commits.

The user can interrupt, inspect, redirect, or extend the work at any point.
Multiple orchestration runs can take place on the same work branch.

### How tickets are processed

1. The orchestrator uses `cr ticket next --json` to find open tickets whose
   dependencies are satisfied.
2. It assigns one ticket per `implementer` subagent and runs independent work
   in parallel when the changes and verification can run safely together. Each
   implementer activates its ticket, completes its tasks, verifies its changes,
   and closes the ticket after all tasks and checks pass.
3. A separate `reviewer` subagent checks each completed ticket using the closed
   ticket path, implementation baseline, and changed paths. Required in-scope
   corrections reopen the ticket for another implementation attempt; independent
   follow-up work is recorded through the `ticket` skill.
4. The orchestrator stages approved ticket changes and invokes the commit skill.
   It serializes staging and commits that share a Git index and preserves
   unrelated changes. Pushing remains under your control.

The orchestrator rechecks ticket availability as work progresses. It reports
completed tickets, commits, remaining work, and blockers when it finishes or
needs your input. The agent session holds orchestration progress. If interrupted,
check ticket state and the Git working tree and index before resuming.

## 5. Review complete work

For aggregate review, run `cr work` to identify the committed comparison range
from the merge base with the original branch through HEAD. The user and agent
review that range together, focusing on the following areas.

- Alignment with the original ideas and specifications.
- Architectural consistency across tickets.
- Integration issues and unintended changes.
- Unnecessary complexity and technical debt.
- Overall test coverage and completeness.

Each ticket can meet its acceptance criteria while the combined changes still
have gaps. Address aggregate findings on the same work branch and repeat the
review as needed.

## 6. Publish and accept

Publish the work branch with standard Git. This command preserves the local
upstream used to calculate the review range.

```sh
git push origin HEAD
```

Open a pull request against the branch the work started from. The user performs
final acceptance through PR review, then the work is merged and the work branch
is cleaned up.

The user can also review and merge locally. Coderail uses Git for the work
boundary and supports workflows with or without a remote provider.

## Responsibility model

| Activity | Primary responsibility |
| --- | --- |
| Initialization | User |
| Work management | User or agent |
| Idea exploration | User and agent |
| Specification | Agent, validated by user |
| Ticket creation | Agent |
| Orchestration | Agent |
| Ticket review | Agent |
| Aggregate review | User and agent |
| Final acceptance | User |

## Three levels of review

| Review | Scope | Purpose |
| --- | --- | --- |
| Ticket review | Individual ticket | Verify implementation correctness against the ticket. |
| Work review | Complete work branch | Check architectural and functional consistency. |
| PR review | Proposed integration | Decide whether to accept the work. |

## Remaining design decisions

- Whether to add a dedicated aggregate review skill or extend the existing
  ticket review skill so it runs `cr work` and reviews the resulting range.
- Whether the exploration skill should automatically recommend starting a work
  branch or leave that decision entirely explicit.

## Upgrade from the CLI workflow

Invoke the skill from your agent session when upgrading from `cr loop`. CodeRail
ignores legacy `[loop]` settings in project and global configuration. Configure
model and reasoning preferences in your agent harness.
