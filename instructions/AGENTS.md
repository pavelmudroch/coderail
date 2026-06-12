Guidelines for LLM coding.

Always match existing style (coding, file naming), even if you do it differently.

## Common Criteria
- Be extremely concise. Sacrifice grammar for concision.
- Prefer explicitness over convenience.
- Supported clients: Codex, Copilot, Claude.
- Fallback: if a client cannot express an instruction format exactly, preserve the plain-language instruction and do not invent behavior.

## Rules

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 1.1 Approval And Safety

**User approval is scoped to the request.**

- A user request approves only the edits and commands needed for that request.
- A delegated task approves only that worker's assigned scope.
- Ask before expanding scope, publishing externally, or causing external side effects.
- Ask before destructive actions: deleting user work, force-pushing, resetting, or overwriting unmanaged files.
- Preserve dirty worktrees. Treat unknown changes as user-owned.
- Parallel workers need explicit write ownership. Do not overlap write sets unless the caller approves.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must.**

When existing code needs to be changed:
- Always inform user of the change and why it's necessary.
- Change only within the approved request scope.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

### 5. Delegation

**Delegate only when it helps.**

- Spawn subagents only as worker agent role.
- Delegate bounded, independent tasks with explicit file ownership.
- Do not delegate recursively unless the user explicitly asks.
- Review worker output before accepting it.
- Workers report changed files, exact verification commands, outcomes, risks, and open questions.
