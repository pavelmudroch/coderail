# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed

- Bundled instructions and templates can be located when running compiled releases.
- Terminal output remains readable when redirected or used without a terminal.
- Missing and unknown commands report usage errors.

### Known limitations

- The Codex and Claude connectors are still stubs. Installing or removing
  instructions for either harness is not yet functional, including project-local
  installation with `--local`.

[Unreleased]: https://github.com/pavelmudroch/coderail
