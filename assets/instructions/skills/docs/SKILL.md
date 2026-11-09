---
name: docs
description: Synchronize project documentation with verified implementation changes
disable-model-invocation: true
---

## Goal

Synchronize project documentation with verified implementation changes.

- Inspect staged, unstaged, and untracked changes.
- Inspect commit history when an explicit comparison baseline is available.
- Identify the net effect of relevant changes.
- Verify affected behavior against the current implementation.
- Identify relevant documentation files, including `README.md`, `CHANGELOG.md`, and others.
- Update documentation to reflect observable behavior, interfaces, configuration, and usage.
- Follow existing documentation structure, terminology, and conventions.

## Boundary

- Limit modifications to relevant documentation files.
- Preserve unrelated documentation changes.
- Use the current implementation as the source of truth.
- Use commit history as context within an explicit comparison range.
- Ask the user for a comparison baseline when committed changes must be inspected and no baseline is available.
- Document verified behavior rather than planned changes.
- Describe current behavior in reference documentation.
- Describe user-facing changes in changelogs.
- Consolidate intermediate implementation changes into their final observable effect.
- Preserve existing changelog format and conventions.
- Keep documentation concise and focused on users.
- Resolve uncertainty through repository inspection; ask the user when essential decisions remain ambiguous.

## Completion

- Verify documentation against the current implementation.
- Validate commands, examples, paths, and configuration references.
- Check affected documentation for consistency and duplication.
- Report updated files and unresolved documentation gaps.