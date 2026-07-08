# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Custom instructions including skills, custom agents and global agent instruction file.
- `cr` cli tool to help with coderail management and automation.
- Currently supported agentic harness tools: [`claude`](https://code.claude.com/docs/en/quickstart#step-1-install-claude-code), [`codex`](https://developers.openai.com/codex/cli), [`copilot`](https://github.com/features/copilot/cli), [`gemini`](https://geminicli.com/)
- **init** command to initialize a new project with a default configuration file.
- **install** command to install custom instructions for selected agentic harness tool.
- **uninstall** command to uninstall custom instructions for selected agentic harness tool.
- **test** command to run predefined tests and validations for changed files by agent, providing feedback loop back to agent for improvement.

[Unreleased]: https://github.com/pavelmudroch/coderail/tree/main