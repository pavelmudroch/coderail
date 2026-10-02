---
title: Core connector discovery and integration
status: forging
---

## Desired Outcome

CodeRail discovers available connectors from its installed `connectors/` directory, uses them for harness-specific installation and uninstallation without hardcoded harness branches, and publishes the versioned contract that connector authors follow.

## Understanding

- Core currently recognizes Codex, Claude, Copilot, and Gemini directly in command parsing, configuration, rendering, installation, uninstallation, and path validation. These named branches move behind discovery or the connector contract.
- This child settles the exact protocol shared with the Codex child and publishes it as `connectors/README.md`, linked from the main README and packaged with CodeRail. The guide covers required layout and version marker, script arguments and process streams, status meanings, generated files, naming and configuration, discovery, safety and ownership, with a small layout and invocation example.
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

## Open Questions

- How should existing configuration that names an unavailable harness be reported and recovered from?
- Which incomplete-connector errors should appear during help, explicit selection, installation, and uninstallation?
