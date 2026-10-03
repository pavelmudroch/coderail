---
title: Core connector discovery and integration
status: ready
---

## Desired Outcome

CodeRail discovers available connectors from its installed `connectors/` directory, uses them for harness-specific installation and uninstallation without hardcoded harness branches, and publishes the versioned contract that connector authors follow.

## Understanding

- The [parent idea](../IDEA.md) supplies the shared staging, translation, prompt-and-wait, configuration precedence, and ownership contract. The decisions below refine that contract for core integration.
- Core currently recognizes Codex, Claude, Copilot, and Gemini directly in command parsing, configuration, rendering, installation, uninstallation, and path validation. These named branches move behind discovery or the connector contract.
- This child settles the exact protocol shared with the Codex child and publishes it as `connectors/README.md`, linked from the main README and packaged with CodeRail. The guide covers required layout and connector metadata, script arguments and process streams, status meanings, generated files, naming and configuration, discovery, safety and ownership, with a small layout and invocation example.
- Only the Codex connector ships in the first connector-enabled release. Claude, Copilot, and Gemini become unavailable until connectors are added; their existing installed files and manifests remain untouched.
- `cr install --help` and `cr uninstall --help` list available connector names. Top-level `cr --help` does not. Loop help can list connectors when loop execution is implemented.
- `cr uninstall <harness>` requires an available connector. If it is missing or incomplete, the command fails without touching installed files or manifests.
- The CodeRail installer must package bundled connectors and track their files with checksums. Edited bundled files are preserved unless `--force` is approved interactively or with `--yes`; user-added connectors remain unowned and are preserved. A collision with a newly bundled connector is an error.

## Constraints

- All scripts must be pure POSIX shell.
- Preserve established `cr install` and `cr uninstall` behavior for the available Codex connector, including ownership, path safety, and confirmation.
- Implement the public connector contract established by the parent and integrate the Codex connector sibling.

## Boundary

- Specify the exact public protocol; implement discovery, availability checks, command dispatch, help, installer packaging and upgrade protection; publish the connector-author guide; and remove core harness-specific branches.
- Implementing other harness connectors and `cr loop` orchestration are outside this child. Codex prompt execution belongs to the Codex connector child.

## Decisions

- Connector availability is validated only when that connector is selected, not during configuration loading. Configuration may retain a default harness or per-connector settings for an unavailable connector without blocking unrelated commands. Selecting it fails with a clear error explaining how to add the connector or choose an available one.
- Help omits connectors considered incomplete by discovery checks.
- Keep `install_global_instruction.sh`, `install_skill.sh`, `install_sub_agent.sh`, and `prompt_and_wait.sh`. Replace `default_home.sh` and the separate `CONTRACT_VERSION` file with `connector.conf`, parsed as `key=value` data with required fields `contract_version`, `default_home`, and `default_command`. Keys are not prefixed with the connector name because the containing directory identifies the connector. Values are read as literal strings.
- The initial contract requires only those three metadata fields. Core ignores unknown metadata keys to allow optional additions in compatible newer contract versions. Malformed syntax or missing required values makes the connector unavailable.
- When a selected connector's default home is needed, core replaces a leading `$HOME` token, either alone or followed by `/`, with the current user's home directory. This is explicit string substitution, not shell evaluation, and preserves spaces in the resulting path. The initial contract supports only this unbraced HOME token in `default_home`; other shell expansions are not supported. Existing configuration and environment override semantics remain unchanged.
- Discovery checks only the immediate connector directory for required metadata and all four retained operation scripts. Each required script must be a readable, executable regular file. Discovery parses metadata without sourcing or executing it and does not inspect helper files, parse operation-script syntax, execute operation scripts, or check whether the harness is installed. Structural completeness does not guarantee successful invocation.
- Use semantic contract versioning, initially `1.0.0`: major versions introduce breaking changes, minor versions introduce compatible additions, and patch versions introduce compatible corrections. The version covers layout, arguments, process streams, exit statuses, and artifact rules. Core explicitly defines supported versions. Missing, malformed, or unsupported version declarations make the connector unavailable; explicit selection explains the failure.
- The declared version identifies the contract behavior implemented by the connector. Core declares a minimum required contract version, independently of CodeRail's release version, and accepts connector versions at or above that minimum within the same major version. For example, a minimum of `1.2.0` accepts `1.2.0` and `1.3.0`, but rejects `1.1.0` and `2.0.0`. Newer connectors must preserve behavior used by older core callers within that major version. Core raises its minimum only when it requires behavior unavailable in older contract versions.
- Connector names start with a lowercase ASCII letter and contain only lowercase ASCII letters, digits, and underscores. Configuration keys are `<name>_home` and `<name>_command`; environment overrides uppercase the name and append `_HOME` or `_COMMAND`. No punctuation normalization is needed, so distinct names cannot collide through normalization.
- Core resolves the harness command using the nonempty environment override, then the effective configured override, then `default_command` from `connector.conf`. It passes the final command to `prompt_and_wait.sh`; that operation uses the supplied command rather than maintaining a separate default. Metadata is the single source of the connector's default command.
- Core resolves the harness home using the same environment-then-configuration-then-metadata precedence. It resolves the metadata's HOME token only when that default is needed, validates the selected home before use, and retains responsibility for destination writes and removals.
- Explicit selection of an unavailable connector identifies the connector and the failed discovery requirement: absent directory, invalid name, missing or unusable required file, or missing, malformed, or incompatible contract version. Errors explain how to correct the requirement or select an available connector. Installation and uninstallation fail before changing destination files or manifests. Exact diagnostic wording belongs to specification.

## Assumptions

- Connectors declaring a compatible contract version implement the corresponding behavior; discovery cannot verify that claim.

## Risks and Caveats

- Connector scripts are executable local code. Staged-output validation protects core-managed writes but does not sandbox connector execution.
- Structural completeness does not prove runtime correctness or harness availability.
- Legacy Claude, Copilot, and Gemini installations remain on disk, but cannot be managed through `cr` until matching connectors are available.
