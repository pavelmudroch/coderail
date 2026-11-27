---
name: orchestrate
description: Orchestrate ticket implementation, review, and commits through subagents until all available work is complete.
disable-model-invocation: true
---

## Goal

- Implement all available tickets through delegated subagents.
- Parallelize independent implementations when safe.
- Review each implementation through a separate subagent.
- Commit reviewed changes.
- Resolve blockers and continue until all work is complete or user intervention is required.

## Boundary

- Act as orchestrator. Delegate implementation and review; do not perform them directly.
- Use `cr ticket next --json` as the source of available tickets.
- Spawn one `implementer` subagent per ticket with the ticket path.
- Spawn a separate `reviewer` subagent for each completed implementation with the closed ticket path, implementation baseline, and changed paths.
- Run implementations in parallel only when their changes cannot conflict.
- Account for shared files, dependencies, verification outputs, and repository state when scheduling parallel work.
- Avoid delegating the same ticket to multiple active subagents.
- Hold dependent tickets until their prerequisites pass review, even if implementation has already closed them.
- Review each completed implementation before committing its changes.
- Stage only approved ticket changes. Invoke <skill>commit</skill> only when the staged diff contains approved work exclusively. Preserve pre-existing staged work and report it as a commit blocker if it cannot be kept outside the commit scope.
- Serialize staging and commits affecting the same Git index.
- Preserve unrelated and user-owned changes.
- Recheck available tickets after implementation, review, or commit changes ticket state.
- Continue processing independent work while other subagents run.
- Resolve subagent failures and blockers when possible. Request user intervention only when necessary.

## Workflow

1. Inspect the working tree using git status.
2. Identify uncommitted Coderail planning artifacts, including new tickets, updated plans and specifications.
3. If only planning artifacts are changed, stage and commit them automatically.
4. If unrelated changes exist, stop and ask the user how to proceed.
5. Run `cr ticket next --json` to discover available tickets.
6. Exclude tickets already assigned to active subagents.
7. Identify tickets safe for parallel implementation.
8. Record the implementation baseline. Spawn `implementer` subagents with the ticket path and instructions to report the closed ticket path and changed paths.
9. Monitor active subagents and collect completed results.
10. For each successfully implemented ticket, spawn a separate `reviewer` subagent with the closed ticket path, baseline, and changed paths.
11. Inspect review results and ticket state.
12. For approved implementations, stage related changes and invoke <skill>commit</skill>.
13. For reopened tickets, return them to the available ticket pool.
14. Reevaluate available tickets, active subagents, and pending commits.
15. Start additional independent work when safe; otherwise wait for active subagents.
16. Repeat until completion or an unresolved blocker requires user intervention.

## Completion

- Stop successfully only when:
  - All implementation and review subagents have finished.
  - `cr ticket next --json` returns no available tickets.
  - All processed tickets are closed.
  - All reviewed changes are committed.
  - No pending changes from orchestration remain uncommitted.
- Attempt to resolve implementation, review, and repository blockers before stopping.
- Stop and request user intervention when a blocker cannot be resolved safely.
- Report completed tickets, commits, remaining work, and unresolved blockers.
