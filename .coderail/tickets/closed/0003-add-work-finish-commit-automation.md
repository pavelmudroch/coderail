---
id: 0003
slug: add-work-finish-commit-automation
title: Add work finish commit automation
status: closed
created_at: 2026-07-23T13:52:22Z
updated_at: 2026-07-23T14:34:08Z
dependencies: 0002
close_reason: done
---

# Add work finish commit automation

Add the optional, user-confirmed commit flow after `cr work finish` has prepared
a non-empty cleaned integration result on the base branch.

## Tasks

1. [x] Add focused tests for automatic-commit prompts and failure handling
2. [x] Implement standard-input confirmation and agent selection
3. [x] Invoke and confirm a parsed agent-generated commit message

## Task details

### 1. Add focused tests for automatic-commit prompts and failure handling

Cover the interactive branches using piped standard input and test agent shims.

Expected outcome:

- Tests cover yes/no parsing, default-yes, invalid-response retry, and EOF cancellation.
- Tests cover configured and selected tools, selection cancellation, invalid or unavailable tools, parsed message acceptance and decline, and all failure paths retaining staged changes.

Validation:

- `sh test/commands/work.test.sh` passes.

### 2. Implement standard-input confirmation and agent selection

Prompt only after a non-empty cleaned result is available.

Expected outcome:

- One reusable yes/no prompt handles automatic-commit and commit-message approval.
- A positive automatic-commit answer uses `default_tool` or prompts once for a supported tool.
- Negative, empty tool, or EOF cancellation succeeds and leaves the integration staged; invalid configured or unavailable tools fail without altering it.

Validation:

- Prompt and selection cases in `sh test/commands/work.test.sh` pass.

### 3. Invoke and confirm a parsed agent-generated commit message

Use the selected agent only to propose the commit message, never to execute a command.

Expected outcome:

- The implementation invokes the existing noninteractive tool form with `cr-commit` against staged non-Coderail changes.
- Only a valid non-empty message between `Commit:` and `Command:` is displayed and passed to Git after approval.
- Parsing, invocation, and Git failures report failure while preserving the staged result.

Validation:

- `sh test/commands/work.test.sh` passes agent output, approval, and failure cases.

## References

- `.coderail/SPEC.md`
- Depends on `0002-prepare-safe-work-finish-integration`
