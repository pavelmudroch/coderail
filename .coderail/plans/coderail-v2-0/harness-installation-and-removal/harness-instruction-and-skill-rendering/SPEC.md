## Problem Statement

Coderail bundles one set of global instructions, skills, and agent definitions, while Codex, Claude Code, Copilot CLI, and Gemini CLI discover and interpret different filenames and metadata. Copying the bundle unchanged can leave instructions or agents undiscovered and can lose the intended skill invocation policy. Users need `cr install <harness>` to prepare usable content for each selected harness without changing the installed harness state until the entire operation is ready.

## Goal

Render every bundled Coderail instruction, skill, supporting file, and agent definition into a complete, deterministic set of destination-relative files for each selected harness. Preserve the source's instruction meaning and express its invocation intent through the selected harness's supported format. Give the installation child a prepared file tree it can validate, protect, and record as owned content.

## Solution Overview

Add a private POSIX-shell renderer called by harness installation. It reads the currently installed Coderail bundle, checks its source entries, and writes one isolated staging tree per selected harness. The tree contains files at the exact paths they should occupy below that harness's configured destination. Installation owns destination selection, collision checks, checksums, manifests, prompts, and application; the renderer never changes an installed harness file.

This specification covers the ready [rendering idea](IDEA.md), one leaf of the split [harness installation idea](../IDEA.md). The [installation child](../harness-installation-and-uninstallation/IDEA.md) consumes its staged output.

## Requirements

1. Support `codex`, `claude`, `copilot`, and `gemini`. Render the complete bundled set for each selected harness; do not add a subset selector or a public render command. Read sources only from the active Coderail installation, rooted at `instructions/AGENTS.md`, `instructions/skills/`, and `instructions/agents/`.
2. Render the main `instructions/AGENTS.md` at the harness destination root. The output names are `AGENTS.md` for Codex, `CLAUDE.md` for Claude, `copilot-instructions.md` for Copilot, and `GEMINI.md` for Gemini. Apart from skill-reference conversion, preserve its content.
3. Render each `instructions/skills/<skill>/` tree recursively below `skills/<skill>/`, retaining every supporting file's relative path. Convert skill references in `SKILL.md` and other Markdown files within that tree. Copy non-Markdown supporting files byte-for-byte and preserve their executable status. Do not interpret marker-looking text in scripts, images, or other non-Markdown files.
4. Treat `<skill>name</skill>` as the canonical source marker. Replace each well-formed, single-line marker whose name follows the bundled skill-name convention with `$name` for Codex or `/name` for Claude, Copilot, and Gemini. Apply this to the global instruction file, skill Markdown, and agent Markdown bodies. Preserve surrounding text and unmarked references; do not infer references from plain words or slash/dollar syntax. A malformed marker remains ordinary text.
5. Retain `disable-model-invocation` in bundled `SKILL.md` front matter. Preserve all skill front matter, including that key, for Claude, Copilot, and Gemini. For Codex, remove the key from rendered `SKILL.md` front matter whether it is `true` or `false`, leaving other fields intact. If the source value is `true`, additionally render `skills/<skill>/agents/openai.yaml` with exactly this policy mapping:

   ```yaml
   policy:
     allow_implicit_invocation: false
   ```

   An absent or `false` source key generates no invocation-policy file. Do not write a `true` Codex policy setting. Codex configuration from other future features may still use this file after an explicit renderer extension.
6. Render every bundled agent. Claude and Gemini receive `agents/<basename>.md`, preserving the source Markdown filename, front matter, and translated body. Copilot receives `agents/<basename>.agent.md` with the same Markdown/front matter and translated body. Codex receives `agents/<basename>.toml`, with source front-matter `name` and `description` as TOML strings and the translated Markdown body as the TOML `developer_instructions` string. Preserve actual source values, including embedded quotes, backslashes, and line breaks. Do not add inferred model, tool, or sandbox settings.
7. Render agent definitions without gating on the selected harness's enabled runtime features. An ordinary source-read, invalid-source, serialization, path, or staging-write error fails rendering. Runtime discovery and interpretation remain the harness's responsibility.
8. The renderer's output is an isolated prepared tree of ordinary files with canonical paths relative to one harness destination. Include generated configuration in that tree. Fail on duplicate output paths, unsafe or unrepresentable paths, source links or special files, missing required source metadata, unsupported source constructs, or conflicting generated configuration. Never silently overwrite one staged file with another.
9. A rendering failure for any selected harness fails the whole requested installation before it changes installed files or manifests. The caller discards all staging trees on failure. A successful render does not itself imply that installation preflight or application will succeed.
10. All implementation scripts and helpers remain pure POSIX shell. Make any new script executable.

## Implementation Decisions

### Destination layout and supported harness contracts

| Harness | Global file | Skill tree | Agent file |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | `skills/<skill>/SKILL.md` | `agents/<name>.toml` |
| Claude Code | `CLAUDE.md` | `skills/<skill>/SKILL.md` | `agents/<name>.md` |
| Copilot CLI | `copilot-instructions.md` | `skills/<skill>/SKILL.md` | `agents/<name>.agent.md` |
| Gemini CLI | `GEMINI.md` | `skills/<skill>/SKILL.md` | `agents/<name>.md` |

All paths in the table are relative to the selected configured harness destination. Copilot's `.agent.md` suffix and Gemini's `GEMINI.md` were resolved during specification after checking current discovery documentation. The former is the user's selected conventional agent filename; Copilot CLI also accepts `.md`. Gemini requires `GEMINI.md` by default unless the user changes `context.fileName`, so rendering does not generate or modify `settings.json` to install `AGENTS.md`.

The scope is each named CLI's user configuration area. Copilot CLI's personal files under `COPILOT_HOME` do not imply that every Copilot IDE or GitHub-hosted surface reads the same files. Codex's selected `CODEX_HOME` receives `skills/` as the installation child requires. OpenAI's current environment-variable reference identifies `CODEX_HOME` as the root containing skills, while its skills guide also documents the shared `$HOME/.agents/skills` location. The chosen destination remains inside the configured Codex home.

### Private renderer handoff

Provide a sourced, private function equivalent to `harness_render <harness> <bundle-root> <empty-stage-root>`. On success, the stage root contains only the prepared payload at destination-relative paths; the caller inventories regular files in canonical, locale-independent path order and validates each path with the shared harness-aware path utility before installation. On failure, the stage is invalid even if partially populated. No separate index or manifest is emitted by rendering, and no public CLI output format is introduced.

The caller creates a distinct temporary stage for each selected harness and renders every stage before installed-state validation or mutation. Rendering must be deterministic for identical inputs and harness selection. Its output paths must fit the sibling installer's permitted harness roots and must exclude metadata paths reserved for manifests. The sibling installer owns exact destination/manifest validation and records `cksum` of bytes actually installed, including `openai.yaml` and TOML agent files.

Use one renderer module under `lib/commands/install/` with small helpers for front-matter parsing, marker replacement, Codex policy output, and TOML string serialization. `lib/commands/install.sh` calls it as part of installation orchestration; the renderer does not parse public flags or acquire releases. Generic path validation stays in `lib/utils/path.sh` as agreed with the sibling installation specification; do not add a renderer-specific variant of the manifest path rules.

### Source and transformation contract

Require a regular, readable `instructions/AGENTS.md` and a real `instructions/skills` and `instructions/agents` directory in the active bundle. An empty skills or agents directory is valid and yields no files from that directory. Enumerate all entries recursively, including dotfiles, in deterministic `LC_ALL=C` path order. Reject symlinks and non-regular, non-directory entries instead of following them. Preserve ordinary supporting-file bytes and executable/non-executable mode; generated YAML and TOML are non-executable.

Each skill directory must contain a regular `SKILL.md` whose top-of-file YAML front matter has one single-line `name` and `description`. Its `name` must match the directory name, and directory names and marker names use ASCII letters, digits, underscores, and hyphens with a leading letter or digit. Reject duplicate skill names, duplicate or non-Boolean `disable-model-invocation` keys, or malformed front-matter delimiters. Other skill front-matter fields pass through unchanged. Codex removes only the top-level policy line, never a matching line in the body. Reserve `agents/openai.yaml` within a bundled skill for renderer-generated Codex metadata; reject that source path for Codex rather than copying it or overwriting it. A future configuration-merging feature needs its own explicit source contract.

Each bundled agent must be a top-level `.md` regular file with front matter containing exactly one single-line `name` and `description`. Interpret those values as a restricted YAML scalar subset: an unquoted value is literal text after the field separator with surrounding separator whitespace removed; a single-quoted value uses doubled single quotes for a literal quote; a double-quoted value supports `\\`, `\"`, `\n`, `\r`, and `\t` escapes. Reject other escapes, multiline scalars, duplicate keys, unsupported fields, invalid quoting, and empty required values so no meaningful agent configuration is silently dropped. Agent names must be unique. Preserve the entire body after the closing front-matter delimiter, with marker translation as the only content edit. The Claude, Copilot, and Gemini outputs preserve the front-matter bytes rather than reserializing them.

Encode Codex agent `name` and `description` as TOML basic strings, and `developer_instructions` as a TOML multiline basic string. Escape quotes, backslashes, delimiter sequences, and control characters as required so TOML parsing recovers exactly the decoded source values and translated body, including trailing newline presence. Reject input bytes the POSIX-shell serializer cannot represent safely, such as NUL, instead of truncating or changing them. Do not evaluate source text as shell code.

Skill-reference replacement is a textual transformation for well-formed markers only. It does not validate that the named skill belongs to the bundle: a bundled instruction can intentionally refer to a skill provided by the harness or another package. The renderer preserves all text outside exact markers, including literal `$` and `/` references already present in the source.

### Invocation and compatibility

`disable-model-invocation: true` expresses bundled author intent. Claude Code and Copilot CLI document the field; Codex documents `agents/openai.yaml` with `policy.allow_implicit_invocation: false`. Gemini receives the front matter unchanged, but the renderer makes no guarantee that Gemini enforces that key or treats a `/name` reference as a command. Likewise, references from one active skill to another remain subject to harness behavior. No Coderail runtime invocation guard is introduced.

The renderer is stateless. Re-rendering from a newer bundle can add or remove prepared paths; the installation child reconciles installed ownership and protects edited files. Source filenames and skill bodies remain bundled conventions, and installation does not rewrite them in the Coderail installation itself.

## Testing Decisions

Add a focused executable POSIX-shell test for the renderer under `tests/commands/install/`, following `tests/suite.sh` and temporary fixture-root conventions. Use fixture bundles rather than the current tree alone: today the bundle has only `SKILL.md` per skill, one `worker.md` agent, and no supporting files. Fixtures should make the important boundaries observable.

Cover all four global filenames, agent suffixes/formats, skill trees, Markdown marker conversion, unchanged unmarked text, recursive Markdown support files, byte-identical non-Markdown assets and executable support scripts, deterministic output, and an empty skills or agents directory. For Codex, cover `true`, `false`, and absent policy values, unchanged non-policy front matter, and exact generated YAML. For TOML, use values and body text with literal quotes, backslashes, triple quotes, tabs, and final-newline variations; assert that a TOML reader recovers the intended values when one is available, and compare expected serialized output without making that reader a runtime dependency.

Cover missing/invalid front matter, duplicate names and paths, unsupported agent metadata, invalid Boolean policy values, source symlinks and special files, unsafe names, reserved generated-file collisions, unreadable sources, and injected staging-write failure. Assert failure status and that no installed destination is changed; caller-level integration tests in the sibling installation child should prove that a failure in the last of several requested harness renders leaves every selected installation and manifest unchanged.

Run `sh -n` on changed shell scripts, execute the renderer test directly with `sh tests/commands/install/render.test.sh`, and run `./bin/cr test <changed-lib-paths>` for test-map coverage. The current `.coderail/test_map` appends `|| :`, so direct test execution is required to observe failures. Do not run the full `tests/all.sh` suite unless implementation also changes shared behavior outside this renderer. Harness CLI discovery checks are useful when the CLIs are available, but ordinary fixture tests must not require installed harnesses or touch real user homes.

## Out of Scope

* Harness destination selection, install/uninstall CLI parsing, ownership manifests, checksums, collision policy, confirmations, file application, release acquisition, self-removal, and project initialization.
* Migration or adoption of pre-manifest harness files and automatic edits to existing harness settings.
* Enforcing invocation rules at runtime or guaranteeing identical cross-skill and agent behavior across harness versions.
* A standalone rendering command or per-harness subset selection.

## Assumptions

* The active Coderail installation is the source bundle. The installer supplies its root and a temporary stage on a filesystem where POSIX file utilities can read and write normal files.
* Bundle authoring can use the restricted single-line front-matter scalar contract above. More complex YAML agent metadata requires an explicit format extension rather than accidental partial conversion.
* The current Codex CLI accepts `CODEX_HOME/skills` as a personal skills location; it is described in the [OpenAI changelog](https://learn.chatgpt.com/docs/changelog) and `CODEX_HOME` still includes skills in the [current environment-variable reference](https://learn.chatgpt.com/docs/config-file/environment-variables). A CLI discovery smoke test remains useful when Codex is available.
* Invocation-policy metadata is advisory to the target harness. Retaining a field that a harness ignores does not create enforcement by Coderail.

## Further Notes

The format decisions were checked against [OpenAI Docs for skills](https://learn.chatgpt.com/docs/build-skills), [OpenAI Docs for custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude Code's configuration reference](https://code.claude.com/docs/en/claude-directory), [GitHub Copilot CLI's command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [Copilot CLI's configuration directory](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference), [Gemini CLI's context-file reference](https://geminicli.com/docs/cli/gemini-md/), and [Gemini CLI's subagent reference](https://geminicli.com/docs/core/subagents/). These establish file formats and discovery paths; the renderer cannot ensure every downstream runtime exposes the same agent or skill capability.

## Ticket Plan

The renderer is split into three implementation tickets:

1. [Render harness instructions and skill trees](../../../../tickets/open/0001-render-harness-instructions-and-skill-trees.md) establishes the private staging function, validated source traversal, and Markdown marker conversion.
2. [Render Codex skill invocation policy](../../../../tickets/open/0002-render-codex-skill-invocation-policy.md) depends on ticket 0001 and adds Codex front-matter conversion and generated policy files.
3. [Render harness agent definitions](../../../../tickets/open/0003-render-harness-agent-definitions.md) depends on tickets 0001 and 0002 and completes agent output and four-harness validation.

The sibling installation work consumes the staged-tree contract and owns caller-level atomicity tests.
