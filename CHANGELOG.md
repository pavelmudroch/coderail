# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-11

### Added

- `cr verify --dry` previews verification, preparation, and cleanup commands
  without executing them, using a `planned` status and supporting `--short`.
- Read-only `cr doctor` diagnostics for installation resources, distribution-owned
  files, launcher and PATH, project initialization, configuration sources,
  global and local harness instructions, and the configured harness executable.
  Checks run even outside a project or with invalid configuration, collect
  independent failures with manual repair guidance, and return a failing exit
  status when issues are found. Automatic repair remains unimplemented.
- Verbose Doctor progress on stderr, including diagnostic paths and executable
  candidates, while retaining the final report on stdout in quiet mode.

### Changed

- Automated loop reviewers are directed to use the `ticket` skill when updating
  or creating tickets.

## [0.2.0] - 2026-11-11

### Added

- `cr verify -c` as a short alias for `--changed`.
- Functional Codex and Claude instruction installation and removal in global and
  project-local scopes, including skills, subagents, and optional general
  instructions, with ownership tracking and existing-file protection.
- Native Codex TOML subagents and skill invocation policies, plus harness-specific
  skill references in translated instructions.
- `docs` skill for synchronizing documentation with implemented changes and
  `mentor` skill for guiding users through ticket implementation and verification.
- `cr loop` implements dependency-ready tickets in fresh Codex or Claude sessions,
  verifies ticket closure, and stages each successful attempt within the initialized
  project. Supports attempt limits, optional review and commits, and raw JSONL logs.
- Per-harness loop model and effort settings, with stage-specific configuration
  and CLI overrides checked by execution preflight before implementation.
- Non-interactive Codex and Claude execution with streaming output and process-group
  cleanup on cancellation or execution failure.

### Changed

- Renamed project configuration from `.coderail/coderail.conf` to `.coderail/config`
  and installation-wide configuration from `coderail.conf` to `config`. The old
  filename is no longer read; rename existing files and run `cr init` in existing
  projects to update ignore rules.
- Renamed the workflow guidance skill from `help` to `compass`.
- Loop implementation and commit prompts use native Codex or Claude skill syntax.
  Auto-review uses built-in instructions without requiring a separate review skill,
  reopening tickets for corrections within scope and creating tickets for independent work.

### Fixed

- Reinstalling a Codex skill removes obsolete owned invocation policies when its
  invocation flag is omitted, while protecting modified and unrelated files.
- Invalid UTF-8 Claude general instructions reject through the returned promise.
- Installer cleanup preserves bootstrap executables that are active or recorded
  as distribution-owned after activation, including interrupted installations.
- `cr init` repairs project ignore rules while preserving custom content, keeping
  nested plans and tickets eligible for version control and runtime output ignored.
  Commands requiring initialization report incomplete projects with repair guidance.
- Exploration inspects the existing idea tree before choosing where to record work.

## [0.1.1] - 2026-11-05

### Fixed

- Forward upgrade version selection correctly to the `cr upgrade` subcommand.
- Report installation progress and check that the bootstrap executable created
  the launcher before reporting success.

## [0.1.0] - 2026-11-05

### Added

- Project initialization with `cr init` and project-specific configuration.
- Idea management with tree views, creation, splitting, ready and reopen commands,
  and JSON output.
- Ticket management with dependencies, activation, closing, reopening, selection of
  next available tickets, and JSON output.
- Configurable file verification with `cr verify`, including changed-file selection,
  preparation and cleanup commands, and concise status output.
- Release packages for Linux, macOS, and Windows on x64 and ARM64, with checksums.
- Stable and rolling canary releases, with `cr upgrade` support for the latest
  stable release, a selected version, or the latest canary via `--canary`.
- Upgrade checks for package integrity and platform compatibility, with protection
  for modified files and preservation of user templates.
- Shell installer for first-time installation and repair on Linux and macOS,
  using verified stable packages and a configurable installation directory.
  Downloads prefer `curl` and fall back to `wget` when `curl` is unavailable.
- `cr upgrade --list` displays published stable versions with `latest` and
  `current` markers without changing the installation.
- Optional PATH setup after installation or upgrade, with separate consent for
  Bash, Zsh, Fish, and Windows. Non-interactive sessions receive manual instructions.
- Expanded the README into a user guide covering installation, project setup,
  ideas, tickets, verification, upgrades, and current command limitations.
  Development and release instructions now live in `DEVELOPMENT.md` and
  `RELEASING.md`.

### Known limitations

- The Codex and Claude connectors are still stubs. Installing or removing
  instructions for either harness is not yet functional, including project-local
  installation with `--local`.

[Unreleased]: https://github.com/pavelmudroch/coderail/compare/v0.3.0...HEAD
[0.1.0]: https://github.com/pavelmudroch/coderail/releases/tag/v0.1.0
[0.1.1]: https://github.com/pavelmudroch/coderail/compare/v0.1.0...v0.1.1
[0.2.0]: https://github.com/pavelmudroch/coderail/compare/v0.1.1...v0.2.0
[0.3.0]: https://github.com/pavelmudroch/coderail/compare/v0.2.0...v0.3.0
