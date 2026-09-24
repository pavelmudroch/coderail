---
title: Render harness instructions and skill trees
status: open
depends-on: 
---

# Render harness instructions and skill trees

Provide the private `harness_render <harness> <bundle-root> <empty-stage-root>` entry point and stage each harness's global instruction and complete skill trees at destination-relative paths. Establish source validation, deterministic traversal, and Markdown skill-reference conversion for later renderer extensions.

## Tasks

1. [ ] Add focused fixture tests for instruction and skill rendering
2. [ ] Implement validated, deterministic source traversal and staging
3. [ ] Render global instructions and complete skill trees

## Task details

### 1. Add focused fixture tests for instruction and skill rendering

Create executable POSIX-shell tests under `tests/commands/install/render.test.sh`, using disposable bundle and stage roots and the existing `tests/suite.sh` conventions.

Expected outcome:

- Tests cover all four global filenames, nested skill files including dotfiles, Markdown marker replacement in instructions and skill Markdown, unchanged malformed/unmarked references, byte-identical non-Markdown files, executable mode preservation, empty skill directories, and repeatable output.
- Tests cover missing required source roots, invalid skill names or required metadata, linked or special source entries, unsafe output paths, duplicate paths, unreadable inputs, and staging-write errors.

Validation:

- Run `sh tests/commands/install/render.test.sh`; assert each invalid case fails and never modifies an installed harness destination.

### 2. Implement validated, deterministic source traversal and staging

Add one sourced private renderer module under `lib/commands/install/`. Validate the harness name, an empty stage root, readable regular `instructions/AGENTS.md`, real `instructions/skills` and `instructions/agents` directories, safe skill names, top-of-file skill front matter with one matching `name` and one `description`, and every recursive source entry before copying it. Traverse in `LC_ALL=C` order, including dotfiles; reject links and special files. Reject duplicate destination-relative paths and all read, path, or write failures. Leave partial stages invalid on error.

Expected outcome:

- The function writes only ordinary files beneath the supplied stage, has no public command or manifest output, and never writes an installed harness home.
- The implementation is pure POSIX shell and leaves path validation for the installer to its shared harness-aware utility.

Validation:

- Run `sh -n` on changed shell scripts and the direct renderer test.

### 3. Render global instructions and complete skill trees

Write `AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`, or `GEMINI.md` at stage root as selected. Copy each skill tree recursively under `skills/<skill>/`, preserving relative paths, non-Markdown bytes, and executable status. In Markdown only, replace exact, single-line `<skill>name</skill>` markers with `$name` for Codex or `/name` for the other harnesses; preserve every other byte and do not require the referenced skill to be bundled. Keep skill front matter intact in this ticket; ticket 0002 adds Codex policy handling.

Expected outcome:

- Identical inputs yield identical staged paths and bytes in canonical order; no destination file or manifest changes during rendering.

Validation:

- Run the direct renderer test and `./bin/cr test <changed-lib-paths>` for test-map coverage, inspecting the direct test result because the current test map masks failures.

## References

- [Rendering specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- [Sibling installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- `lib/commands/install.sh`, `tests/suite.sh`
