---
title: Public connector contract
status: split
---

## Desired Outcome

CodeRail has a published, versioned connector contract and uses it to discover and run harness connectors, so authors can add a complete connector under the active CodeRail installation's `connectors/` directory without changing core code.

## Understanding

- This parent holds the shared connector contract for installation, uninstallation, and prompt-and-wait. It specifies what makes a connector available and how core and a connector exchange harness-specific behavior.
- The core integration child publishes `connectors/README.md`, links it from the main README, and packages it with CodeRail. The guide specifies the layout and version marker; each operation's arguments, stdout, stderr, exit statuses, and file outputs; naming and configuration mapping; discovery checks; and the core/connector ownership boundary. It includes a small example connector layout and invocation examples.
- The contract covers required capabilities, invocation and error behavior, naming and discovery criteria, generated-artifact ownership, and safe destination paths. The core integration child's specification will settle argument ordering, exit-status meanings, version-marker format, and exact file layout.
- A valid connector implements the full uniform contract; an incomplete directory is unavailable and must yield a clear error when named.
- The three staged `install_*` scripts under `connectors/codex/` are the preferred public operation files. The staged `prompt.sh` should become `prompt_and_wait.sh`. Their exact argument order and exit-status meanings remain for specification.
- Today, `harness_render` writes a complete payload into an empty staging directory. The shared lifecycle code then validates staged paths, checks conflicts, plans file changes, prompts about edited files, writes destination files, and maintains the per-harness manifest. This existing separation is the starting point for the contract discussion.
- The current rendering logic contains harness-specific global instruction names, skill reference syntax, agent formats, and Codex-specific skill policy. The contract must give connector authors a way to supply those choices without adding core branches.
- Core configuration currently defines separate home and command settings for each named harness. A public connector contract needs a generic way to obtain connector-specific settings without new core branches.
- Core currently permits only named harness-specific payload shapes (a global file, `skills/`, and `agents/`). The new contract must distinguish generic path safety and reserved manifest paths from artifact layout, which the connector owns.
- Only the Codex connector ships in the first connector-enabled release. Claude, Copilot, and Gemini become unavailable until connectors are added; their existing installed files and manifests remain untouched.
- The CodeRail installer currently packages `bin/`, `lib/`, `instructions/`, and `templates/`, but not `connectors/`. Packaging the connector scripts and guide is part of core integration.

## Constraints

- All connector scripts must be pure POSIX shell.
- The contract must preserve per-harness manifest ownership, safe destination-path checks, and confirmation behavior for managed files.
- The contract must allow core to avoid named harness branches and must support both bundled and user-added connectors.
- Connector naming and the generic home-setting mapping must be unambiguous and shell-safe.

## Decisions

- This split parent carries common contract decisions and has no `SPEC.md`. The core integration child's specification settles the exact protocol and publishes the author guide; the Codex child implements the same protocol. Specify core integration before the Codex implementation so their interfaces agree.
- Discover connectors only under the active CodeRail installation's `connectors/` directory. User-added connectors there are supported; no other search path is in scope.
- Bundled connector files are tracked in CodeRail's installation manifest with checksums. On upgrade, unchanged files may be upgraded; edited files are preserved unless `--force` is approved interactively or with `--yes`. User-added connector files remain unowned and are preserved. A path collision with a newly bundled connector is an error.
- Available connector names appear in `cr install --help` and `cr uninstall --help`, not top-level `cr --help`. `cr loop --help` will list them when loop execution is implemented.
- `cr uninstall <harness>` requires an available connector. If it is unavailable, the command fails without touching installed files or manifests.
- A connector supplies its default harness home, chooses paths relative to that home, and renders the harness-specific payload into an empty staging directory.
- Core may override the connector's default home at the user's request. Core validates the chosen home and staged relative paths, resolves file conflicts, owns manifests and confirmation decisions, and performs destination writes and removals.
- Connectors do not directly mutate the harness home during install or uninstall. The public contract has no uninstall operation: core uses the connector's resolved home and its ownership manifest to remove managed files.
- Users override a connector's default home through per-connector environment and configuration settings derived from its connector name. Existing `CODEX_HOME` and `codex_home` remain valid for Codex. This keeps overrides unambiguous when one command selects multiple connectors.
- Core identifies each source item as a global instruction, skill, or sub-agent. The connector exposes a separate translation operation for each type; it does not classify source items. Each operation renders the provided item into the staging area and chooses its relative destination under the harness home.
- Core invokes the matching instruction script with one source item and a fresh empty item-specific staging directory. The source item may be a file or a directory; a skill is passed as its full directory, including `SKILL.md` and any helper files. The connector translates the complete item and writes its output beneath that staging directory.
- Each instruction script prints every file it created, one path per line. Paths are relative to the staging directory and therefore to the harness home after installation. Core validates the reported list against the actual staged regular files, rejects missing, extra, duplicate, or unsafe paths, and merges validated item outputs while rejecting collisions.
- Core combines the outputs of all translation operations into one staged payload, validates the complete tree and cross-connector conflicts, and finishes preflight before changing any harness home.
- Every connector must implement all three translation operations. Each source item must yield at least one artifact; one item may yield multiple files. Empty output or failure aborts installation before destination changes.
- Connectors own their artifact layout under the harness home. Core enforces generic relative-path safety, prevents collisions between rendered items and connectors, and reserves its ownership metadata paths; it does not hardcode harness-specific file or directory shapes.
- Core executes each public connector operation script as a separate POSIX shell process. Connector shell state is not sourced into core and is not shared in memory between operations. Core supplies item types by choosing the matching script, and the public contract defines each script's inputs and outputs.
- The public surface uses separate executable operation scripts: `default_home.sh`, `install_global_instruction.sh`, `install_skill.sh`, `install_sub_agent.sh`, and `prompt_and_wait.sh`. A contract-version marker also belongs in the public layout. Exact arguments, output files, and marker format belong to the specification.
- `default_home.sh` prints one absolute default-home path. Core validates it and then applies the selected per-connector environment or configuration override.
- A connector chooses its default harness command for prompting. Users may override that command through generic per-connector environment and configuration settings derived from the connector name; existing `CODEX_COMMAND` and `codex_command` remain valid for Codex. Core passes the selected command to `prompt_and_wait.sh` through the contract without adding named harness branches.
- Prompt-and-wait is required in the first uniform contract. `prompt_and_wait.sh` accepts the complete prompt text as one argument, passes it to its harness, and waits for it to finish. It streams live harness output to stderr so callers can redirect it to a file and read it while the harness runs or later. It writes the harness's final text response to stdout, which may be empty, and returns terminal status through its process result. Exact status encoding belongs to the specification.
- The intended caller is the future `cr loop`, which sends predefined prompts such as a skill invocation with a ticket-file reference. This contract does not add a standalone user-facing prompt command.
- Each prompt is an independent request. The contract does not require preserving a harness conversation or session across calls; the caller supplies the full prompt context for each request.
- A prompt request supplies the prompt text; the connector inherits the process working directory set by `cr --cwd` (or the caller's current directory) and runs the harness there. The public prompt request does not need a separate cwd field.
- Help and discovery use quick structural checks for required files and a supported contract-version marker. They do not execute connector code. A directory missing the minimum structure is not listed, and explicitly naming it yields a clear error. A connector that passes structural checks can still fail when invoked; core reports that failure before destination changes.

## Boundary

- The Codex child implements Codex-specific translation and prompt-and-wait. The core integration child implements discovery, dispatch, installation lifecycle integration, packaging, and the public author guide.
- Implementing `cr loop` and additional harness connectors is outside this parent.

## Risks and Caveats

- A connector is executable local shell code. Core can validate a connector's staged output and manage its own writes, but cannot prevent a malicious or broken connector script from writing outside the stage while it runs.
- Structural discovery shows that the required files and version marker exist; it cannot prove that connector code will run correctly.
- Removing legacy core support for Claude, Copilot, and Gemini is an intentional compatibility break. Existing files and manifests stay on disk until a matching connector is available or the user removes them outside `cr`.
- Existing configuration naming an unavailable harness may need updating when this release is installed.

## Decomposition

Two child specifications implement the shared contract:

1. [Core connector discovery and integration](core-connector-discovery-and-integration/IDEA.md) — settle the exact public protocol, publish the author guide, discover and dispatch connectors, package and protect bundled connectors, and remove named harness branches from core.
2. [Codex connector](codex-connector/IDEA.md) — implement Codex instruction translation and prompt-and-wait against that protocol, preserving the established Codex install and uninstall experience.
