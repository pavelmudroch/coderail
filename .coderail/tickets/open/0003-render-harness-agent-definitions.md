---
title: Render harness agent definitions
status: open
depends-on: 0001, 0002
---

# Render harness agent definitions

Complete the private staged payload with every bundled agent, preserving agent Markdown for Claude, Copilot, and Gemini and serializing Codex agents as TOML.

## Tasks

1. [ ] Add agent format and failure fixture tests
2. [ ] Validate agent source metadata and render Markdown agents
3. [ ] Serialize Codex agents as lossless TOML
4. [ ] Verify the complete four-harness renderer contract

## Task details

### 1. Add agent format and failure fixture tests

Extend `tests/commands/install/render.test.sh` with top-level agent fixtures for all four suffixes, translated body markers, preserved non-Codex front matter, empty agents directory, deterministic output, and names/descriptions/body containing quotes, backslashes, triple quotes, tabs, escapes, and differing final-newline presence. Include malformed or duplicate metadata, unsupported fields, unsafe names, links, special files, and forced read/write failures.

Expected outcome:

- Expected TOML output is compared byte-for-byte; when a TOML reader is available, it also recovers the exact decoded fields and translated body without becoming a runtime dependency.
- Every invalid agent source fails rendering, with no installed destination touched.

Validation:

- Run `sh tests/commands/install/render.test.sh` and confirm failure assertions observe nonzero status.

### 2. Validate agent source metadata and render Markdown agents

Accept only top-level regular `.md` agent files with one single-line `name` and `description` in valid top-of-file YAML front matter. Decode only the specification's unquoted, single-quoted, and double-quoted scalar subset; reject unsupported fields, escapes, multiline values, duplicate keys or names, malformed delimiters, and empty required values. For Claude and Gemini stage `agents/<basename>.md`; for Copilot stage `agents/<basename>.agent.md`. Preserve source front-matter bytes and translate exact skill markers in the body.

Expected outcome:

- Every bundled agent is staged regardless of harness runtime feature flags; agent path or source errors fail the full render.

Validation:

- Run direct fixture tests for filenames, metadata rejection, and unchanged front matter.

### 3. Serialize Codex agents as lossless TOML

Stage `agents/<basename>.toml` with decoded `name` and `description` as TOML basic strings and translated Markdown body as a TOML multiline basic string. Escape quotes, backslashes, delimiter sequences, and controls so TOML parsing recovers exact values and trailing-newline state. Reject bytes POSIX shell cannot safely represent, including NUL, and never evaluate source text as shell code.

Expected outcome:

- Codex agent files contain no inferred model, tool, or sandbox settings and cannot collide silently with another staged path.

Validation:

- Compare exact serialized output and round-trip through an optional TOML reader; run `sh -n` on changed shell scripts.

### 4. Verify the complete four-harness renderer contract

Run fixture rendering for each harness and a repeated run against identical inputs. Confirm complete staged trees, canonical relative paths, stable bytes and modes, and failure for an invalid last harness without relying on installed CLIs. Coordinate the caller-level multi-harness atomicity case with the sibling installation ticket; the renderer itself changes no installed files or manifests.

Expected outcome:

- The private function is ready for `lib/commands/install.sh` to source and call after the installer creates one isolated stage per selected harness.

Validation:

- Run `sh tests/commands/install/render.test.sh` and `./bin/cr test <changed-lib-paths>`; do not run the full suite unless shared behavior outside the renderer changes.

## References

- [Rendering specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- [Sibling installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- Tickets `0001-render-harness-instructions-and-skill-trees`, `0002-render-codex-skill-invocation-policy`
