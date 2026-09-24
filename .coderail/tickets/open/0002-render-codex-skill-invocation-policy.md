---
title: Render Codex skill invocation policy
status: open
depends-on: 0001
---

# Render Codex skill invocation policy

Translate bundled `disable-model-invocation` metadata into Codex skill policy while preserving source front matter for the other harnesses.

## Tasks

1. [ ] Add policy and collision fixture tests
2. [ ] Render Codex front matter and generated policy files

## Task details

### 1. Add policy and collision fixture tests

Extend the executable renderer test with `true`, `false`, and absent policy keys, unrelated front-matter fields, a body line that resembles the policy key, duplicate and non-Boolean keys, and bundled `agents/openai.yaml` collisions.

Expected outcome:

- Tests assert exact generated YAML and absence of a generated file for `false` or absent keys.
- Tests prove Claude, Copilot, and Gemini keep source front matter unchanged; Codex removes only the top-level policy field from rendered `SKILL.md` and preserves body text.
- Codex rejects a bundled reserved `agents/openai.yaml` path before it can be overwritten.

Validation:

- Run `sh tests/commands/install/render.test.sh` and confirm rejected metadata or collisions return failure.

### 2. Render Codex front matter and generated policy files

Extend the private renderer's skill metadata handling. Accept exactly one Boolean `disable-model-invocation` value when present. For Codex, remove that field from `SKILL.md` front matter regardless of value; when it is `true`, stage `skills/<skill>/agents/openai.yaml` containing exactly `policy:\n  allow_implicit_invocation: false\n`. Reserve that generated path for Codex, including when no policy file would be generated. Preserve every other skill field and supporting file; other harnesses retain original front matter.

Expected outcome:

- Codex receives no explicit `allow_implicit_invocation: true`; all generated files are non-executable and participate in duplicate-path checks.

Validation:

- Run `sh -n` on changed shell scripts, the direct renderer test, and `./bin/cr test <changed-lib-paths>`.

## References

- [Rendering specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- Ticket `0001-render-harness-instructions-and-skill-trees`
