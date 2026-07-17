# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `cr ticket loop` command for iterating through open tickets with satisfied dependencies without user interaction.
- `cr ticket loop` forwards agent CLI arguments supplied after `--`.

### Changed

- `cr clean` removal policy when there are no tickets requires user confirmation for non restorable changes before removing stale Coderail workflow files.
- All skills renamed to `cr-<skill-name>` for compatibility with build in commands to avoid name collisions.
- Skills `tickets-from-spec` and `ticket-from-plan` merged into `tickets-from-context` skill.

## [v1.1.0] - 2026-07-15

### Added

- `build/release.sh` helper for guarded stable release publishing.
- Logging behavior for INSTALL script and upgrade command.
- `cr clean` command for removing stale Coderail workflow files after ticket work is resolved.

### Changed

- `cr --version` now reads the version from `lib/version.sh`.
- Missing `tickets` directory is no longer treated as an error in `cr ticket` commands.

### Deprecated

- `cr ticket clean` in favor of `cr clean`.

## [v1.0.0] - 2026-07-14

### Added

- Custom instructions including skills, custom agents and global agent instruction file.
- `cr` cli tool to help with coderail management and automation.
- Currently supported agentic harness tools: [`claude`](https://code.claude.com/docs/en/quickstart#step-1-install-claude-code), [`codex`](https://developers.openai.com/codex/cli), [`copilot`](https://github.com/features/copilot/cli), [`gemini`](https://geminicli.com/)
- **init** command to initialize a new project with a default configuration file.
- **install** command to install custom instructions for selected agentic harness tool.
- **uninstall** command to uninstall custom instructions for selected agentic harness tool.
- **test** command to run predefined tests and validations for changed files by agent, providing feedback loop back to agent for improvement.
- **ticket** command to manage branch-local tickets, including create, next, activate, close, deactivate, reopen, validate, and clean subcommands.
- **upgrade** command to upgrade the coderail tool to the latest, or specified version.
- **INSTALL** an installation POSIX shell script for installing coderail.
- `default_tool` config support for `cr install` and `cr uninstall` when no tool argument is provided.
- Directory selectors for `cr test`, expanded recursively to regular files.

[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v1.1.0...HEAD
[v1.1.0]: https://github.com/pavelmudroch/coderail/compare/v1.0.0...v1.1.0
[v1.0.0]: https://github.com/pavelmudroch/coderail/releases/tag/v1.0.0
