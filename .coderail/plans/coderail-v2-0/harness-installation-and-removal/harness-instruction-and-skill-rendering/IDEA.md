---
title: Harness instruction and skill rendering
status: ready
---

## Desired Outcome

Coderail can render its bundled instructions, skills, and agent definitions into files usable by Codex, Claude, Copilot, and Gemini, preserving the agreed instruction and invocation behavior for each harness.

## Understanding

* Inherits scope, constraints, and shared decisions from [Harness installation and removal](../IDEA.md).
* Owns translation from bundled sources into harness-specific file contents and destination-relative paths, including filenames, directory layout, skill references, invocation syntax, front matter, and accompanying configuration files.
* Includes bundled agent definitions such as `instructions/agents/worker.md`. Render these into `agents/` relative to the selected harness destination. Claude, Copilot, and Gemini retain Markdown files; Codex receives converted TOML files. Do not gate rendering on runtime harness capabilities.
* Invocation policy is part of the behavior being translated. `disable-model-invocation: true` expresses the intent that an agent must not select the skill on its own. The harness controls enforcement and whether a reference from another active skill permits invocation; Coderail does not implement its own invocation enforcement.
* Differences such as `/` versus `$` references and policy expressed in front matter versus separate configuration motivate this boundary. Verify the actual supported contracts for each harness during specification.
* All four harnesses share one rendering idea. Each selected harness receives all bundled Coderail instructions, skills, and agent definitions; subset selection is outside scope.
* [Harness installation and uninstallation](../harness-installation-and-uninstallation/IDEA.md) owns installing the rendered files, their ownership manifests, edit protection, and removal. Rendering does not change installed harness files or their manifests.

## Decisions

* Copy the bundled main global instruction file `instructions/AGENTS.md` to the root of the selected harness destination. Keep the filename `AGENTS.md` for Codex, rename it to `CLAUDE.md` for Claude, `copilot-instructions.md` for Copilot, and `GEMINI.md` for Gemini. Preserve its content except for the agreed skill-reference translation.
* Retain `disable-model-invocation` in bundled skill front matter as the source convention for invocation policy.
* For Claude, Copilot, and Gemini, preserve skill front matter, including `disable-model-invocation: true`.
* For Codex, remove `disable-model-invocation` from the rendered `SKILL.md` front matter. When its source value is `true`, generate `agents/openai.yaml` inside the same skill directory with the following nested YAML configuration:

  ```yaml
  policy:
    allow_implicit_invocation: false
  ```

* For Codex, when the source `disable-model-invocation` key is absent or explicitly `false`, omit the invocation-policy setting and do not generate `agents/openai.yaml` solely for invocation policy. Other required configuration may still require that file. An explicitly `false` key is still removed from rendered `SKILL.md` front matter.
* Cross-skill invocation behavior belongs to each harness. Rendering supplies the agreed metadata and skill references; it does not guarantee that harnesses interpret references identically.
* Retain `<skill>name</skill>` as the canonical skill-reference marker in both bundled instructions and skills. Render it as `/name` for Claude, Copilot, and Gemini, and as `$name` for Codex. Leave ordinary text and unmarked references unchanged.
* Recursively include supporting files within each bundled skill directory, preserving relative structure. Translate skill-reference markers in Markdown supporting files; preserve other supporting files unchanged, subject to the explicitly required generated Codex configuration.
* For Claude and Gemini, copy bundled agent Markdown files into `agents/`, preserving filenames and front matter and translating skill-reference markers in their content. For Copilot, retain the Markdown format and front matter but write each agent as `agents/<basename>.agent.md`, translating skill-reference markers in its content.
* For Codex, convert each bundled agent Markdown file to `agents/<basename>.toml`. Convert front-matter `name` and `description` into TOML string assignments and put the Markdown body, after skill-reference translation, into a multiline `developer_instructions` string:

  ```toml
  name = "worker"
  description = "Agent that executes delegated tasks."
  developer_instructions = """
  Agent Markdown body with $skill references.
  """
  ```

* TOML serialization must preserve the source values and rendered body, including literal quotes and backslashes. Escaping and parsing details belong in specification.
* Agent rendering does not fail because a harness lacks a runtime capability; interpretation belongs to the harness. Ordinary source-read and output-write failures remain rendering failures under the shared preparation contract.
* Produce a prepared set of files with paths relative to the selected harness destination. Installation consumes and validates that set and records checksums of the bytes actually installed.
* Complete rendering for every selected harness before installation mutates any installed file or manifest. A rendering failure leaves installed harness state unchanged.
* Rendering must include accompanying configuration in its prepared output so installation can apply the same ownership and protection rules to all generated files.
* No separate public rendering command is required. The shared interface and preparation mechanism belong in specification.

## Constraints

* All scripts and helpers remain pure POSIX shell; new scripts must be executable.
* Reuse shared path utilities where path validation is needed. Coordinate permitted harness paths with the installation child, retaining safe relative paths and the internal installer's existing restrictions.
* Manifest management, checksum protection, overwrite/deletion confirmations, destination configuration, release acquisition, self-removal, and project initialization are outside this child's scope.

## Assumptions

* The currently installed Coderail bundle supplies the source instructions, skills, supporting files, and agent definitions. This child does not acquire releases.
* Skills referenced by another active skill are expected to remain usable even when automatic invocation is disabled, but this is an unverified expectation about harness behavior, not a renderer guarantee.

## Risks and Caveats

* Harnesses may not offer equivalent invocation controls. Preserving or translating policy metadata does not establish equivalent runtime behavior; enforcement remains with each harness.
* Agent definitions use Markdown copying for Claude, Copilot, and Gemini and TOML conversion for Codex, with skill-reference translation in all four. Rendering does not guarantee identical runtime interpretation of agent roles.
* Harness formats can evolve independently. Verify their supported syntax and configuration contracts when specifying rendering.
