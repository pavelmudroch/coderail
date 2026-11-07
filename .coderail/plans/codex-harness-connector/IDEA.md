---
title: "Codex harness connector"
status: "ready"
---

## Outcome

Deliver a functional Codex harness connector for Coderail installation and
uninstallation, covering skills, general instructions, and subagents.

## Confirmed decisions

- The first delivery covers skills, general instructions, and subagents.
- Keep connectors as similar as practical for code clarity: use the same
  target-bound constructor, translation methods, validation/error conventions,
  input ownership rules, and shared installer/manifest lifecycle. Follow the
  existing Claude connector organization and project utilities. Keep native
  format, scope-dependent paths, and agreed content transformations explicit
  within each connector; avoid new abstractions without a concrete need.
- For local Codex operations, `home` is the absolute project root. Skills
  translate to `.codex/skills/<name>/<source-path>`, subagents to `.codex/agents/`,
  and general instructions to `AGENTS.md`, all relative to that home. The existing
  manifest derivation puts the local Codex manifest at `<projectRoot>/.coderail-install`.
  Claude keeps its existing `.claude` home and separate manifest. No destination
  root API extension or parent-directory traversal is needed.
- General instructions use whole-file ownership and replacement of `AGENTS.md`,
  with existing conflict checks and force/confirmation behavior. Uninstall removes
  the owned file under existing protections. No section editing or merging.
- Keep `ConnectorFile` and the version 1 whole-file manifest format unchanged.
  Introduce sections only if a concrete need justifies them in future work.
- Codex supports `.codex/skills` as well as `.agents/skills`, as clarified by
  the user. Do not assume skill installation requires a separate `.agents` root.

## Current understanding

- `src/harness/codex.ts` is a placeholder. The existing connector contract binds
  a global or local installation target at construction, exposes one absolute
  home, and returns fully materialized translation outputs relative to that home.
- Shared commands own optional source discovery, aggregate destination validation,
  conflict handling, filesystem mutation, and the `.coderail-install` manifest.
  All translations and destination inspection finish before writes per harness.
- The current Claude implementation provides metadata validation, binary asset
  preservation, and skill-tag translation as a concrete comparison. Its ready
  idea records Claude-specific decisions; those are not automatically Codex decisions.
- Official documentation checked on 2026-11-07 lists repository skills under
  `.agents/skills` and user skills under `~/.agents/skills`. Codex skill invocation
  uses `$name`. Skill directories require `SKILL.md` with name and description.
- General instructions load from `AGENTS.md` or the higher-priority
  `AGENTS.override.md` in Codex home (default `~/.codex`, configurable via
  `CODEX_HOME`), and from the project root through the working directory.
- No equivalent auto-loaded Markdown rules directory is documented for Codex.
  Its `.codex/rules/*.rules` files control command execution policy, rather than
  general instructions. Configuration offers inline `developer_instructions`;
  `model_instructions_file` replaces built-in instructions and is unsuitable
  for simply adding Coderail guidance. A dedicated Markdown file would need
  an explicit instruction to read it, for example from `AGENTS.md`.
- Custom agents are standalone TOML files in `~/.codex/agents/` or project
  `.codex/agents/`. They require `name`, `description`, and
  `developer_instructions`. A custom `worker` takes precedence over the built-in
  worker. The bundled Coderail agent is named `worker`.
- Local Codex home is an installation boundary, not the native Codex config
  directory: using the project root accommodates both `AGENTS.md` and `.codex/`
  assets within existing path validation and manifest handling.

## Agreed layout and module boundaries

- For global operations, use native Codex home (default `~/.codex`), skills
  under `skills/<name>/`, subagents under `agents/`, and `AGENTS.md`. Resolve
  home once at construction. An unset or empty `CODEX_HOME` uses `~/.codex`;
  accept absolute overrides and reject relative overrides with a clear error.
  Local operations ignore `CODEX_HOME`, including invalid relative values.
- Reuse shared installation protections, existing connector signatures, and
  project utilities. Keep Codex-specific scope-dependent path prefixes inside
  `src/harness/codex.ts`.
- Keep the target-bound constructor, name/home properties, three translation
  signatures, and disposal unchanged. Remove the unused placeholder
  `manifestPath` getter, matching Claude; shared commands derive the manifest.
- Use `@md` for Markdown/frontmatter parsing and serialization. No YAML or TOML
  parsers or parser dependencies may be introduced, including for verification.
  The generated YAML has a fixed boolean policy shape. Generate the three TOML
  string fields with correct native escaping, using private connector helpers as
  needed; do not add a general format framework.
- Add connector coverage in `tests/harness/codex.test.ts` and real-connector
  integration coverage in existing install/uninstall command tests. Retain the
  shared installer and manifest contracts and established test conventions.

## Agreed content transformations

- Translate every `<skill>name</skill>` occurrence to `$name` in general
  instructions, root `SKILL.md`, and subagent instructions.
  Preserve referenced names even when absent from the installation bundle;
  include literal examples and code blocks within those instruction files.
- Preserve general instruction content except skill-tag replacement.
- Preserve skill directory structure. Copy all supporting files other than
  root `SKILL.md` byte-for-byte, including text, nested Markdown, and binary
  assets; do not translate skill tags or validate UTF-8 in supporting files.
  Require valid UTF-8 for instruction inputs being transformed (`SKILL.md`,
  general instructions, and agent Markdown). Do not mutate input records.
  Translation errors identify the source path and reason.
- Validate root `SKILL.md`, nonblank string name/description, and skill name
  matching its directory using the existing `@md` capability.
- Translate boolean `disable-model-invocation` to the inverse of
  `policy.allow_implicit_invocation` in skill `agents/openai.yaml`. Remove the
  translated source field from output `SKILL.md`; omission adds no policy.
  Official documentation confirms false disables implicit invocation while
  preserving explicit `$skill` invocation.
- The user guarantees that source skill bundles contain no `agents/openai.yaml`.
  Do not parse or merge YAML configuration. When `disable-model-invocation` is
  explicitly present, generate `agents/openai.yaml` containing only the inverse
  invocation policy; omission generates no configuration file. Existing installed
  configuration files remain subject to normal whole-file ownership/conflict
  handling. Supporting files are copied unchanged as stated above.
- Unsupported harness options are optional capabilities: ignore them rather
  than reject installation or invent replacement behavior. In particular, ignore
  `user-invocable`, including `false`, for Codex. Untranslated skill metadata may
  remain in frontmatter without claiming Codex honors it. Continue validating
  required metadata and the supported `disable-model-invocation` boolean; this
  policy does not excuse malformed input or invalid supported options.
- Convert agent Markdown frontmatter name/description and Markdown body to TOML
  name/description/developer_instructions. Apply skill-tag replacement to text.
  Leave model, reasoning, permissions, and feature settings inherited. Translate
  name/description and body; validate nonblank string name/description and a
  name matching the source filename without `.md`, as in Claude. Ignore other
  unsupported source metadata rather than
  reject it. Preserve source agent names, including `worker`, which takes
  precedence over Codex's built-in worker. Flatten nested source agent paths
  to `<name>.toml` in the scope-dependent native agents directory: source
  `agents/review/worker.md` becomes local `.codex/agents/worker.toml`. Duplicate
  names produce duplicate destinations and fail existing aggregate validation.
- Serialization must safely preserve quotes, backslashes, newlines, and Unicode.
  Preserve source bytes except intentional transformations; generated metadata
  and TOML may use canonical serialization. Reuse `@md` for Markdown work and
  follow the agreed parser-free generation boundaries above.

## Readiness

No consequential decisions remain open. No decomposition is needed. Connector
public interfaces and module boundaries are retained and reviewed. Private
validation/serialization helpers, exact output formatting within the agreed
behavior, and detailed test organization remain implementation choices. Source
bundles contain no `agents/openai.yaml`; this is an explicit input assumption.
Existing `AGENTS.override.md` files retain native precedence; do not modify
unrelated override files or change native discovery configuration.

## Verification expectations

- Cover global/local destination paths and manifest isolation, global home
  overrides (unset, empty, absolute, rejected relative), and local independence
  from all override values.
- Cover whole-file general instruction replacement, existing-file and modified
  file conflicts, force/confirmation behavior, and real-connector install and
  uninstall round trips. Retain no-source no-op and partial-bundle behavior.
- Cover malformed/missing root skill metadata, name mismatches, invalid UTF-8
  in transformed instructions, unsupported ignored options, and valid boolean
  invocation flags. Verify errors identify source paths and prevent writes.
- Verify every skill-tag occurrence in transformed files, including code
  examples, repeated references, and names absent from the bundle. Verify all
  supporting files remain byte-for-byte unchanged, including nested Markdown
  containing skill tags and binary assets. Inputs remain caller-owned.
- Verify generated invocation YAML for explicit true and false flags and no
  generated YAML when omitted. Check exact expected native-format fixtures;
  introduce no YAML parser or merging capability.
- Verify agent TOML against independently specified expected fixtures covering
  quotes, backslashes, line breaks, tabs, control-character escaping, and Unicode.
  Preserve intended string values and source body content through correct TOML
  escaping. Introduce no TOML parser or parser-based round-trip verification.
- Cover flattened nested agent paths, duplicate destination rejection, source
  metadata validation, name preservation, and absence of invented model or
  permission settings. Unsupported agent metadata must not block installation.
- Retain destination path/symlink protections and validation/inspection before
  writes for each harness, including valid assets preceding an invalid asset.
- Run `cr verify` for each source/test file modified during implementation, as
  required by AGENTS.md. Exploration has modified no source/test files.

## References

- `../claude-harness-connector/IDEA.md`
- `../local-harness-instruction-installation/IDEA.md`
- `src/harness/codex.ts`
- `src/harness/connector.ts`
- `src/harness/claude.ts`
- `src/commands/install.ts`
- `src/commands/uninstall.ts`
- `src/commands/helpers/get-instruction-files.ts`
- `assets/instructions/agents/worker.md`
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/agent-configuration/rules
- https://learn.chatgpt.com/docs/config-file/config-reference
