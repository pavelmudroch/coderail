# CodeRail

CodeRail helps you build software with coding agents while staying involved in
what gets built and understanding how it works. It combines agent skills with a
small CLI for organizing ideas, tracking tickets, and running project checks.
It works with Codex and Claude.

## Table of contents

- [Why CodeRail?](#why-coderail)
- [Installation](#installation)
- [Typical workflow](#typical-workflow)
  - [1. Set up your project](#1-set-up-your-project)
  - [2. Explore the idea](#2-explore-the-idea)
  - [3. Create actionable tickets](#3-create-actionable-tickets)
  - [4. Implement and verify](#4-implement-and-verify)
  - [5. Walk through the changes](#5-walk-through-the-changes)
  - [6. Update documentation and commit](#6-update-documentation-and-commit)
- [Further reading](#further-reading)
- [License](#license)

## Why CodeRail?

Delegating implementation should still leave you able to explain the design,
review the changes, and maintain the result. CodeRail gives that collaboration a
repeatable structure: agree on the outcome, break it into verifiable work, let an
agent implement it, and walk through the result together.

Ideas, decisions, and tickets live in Markdown files alongside your code, so they
survive agent sessions and can be kept in version control. You choose how much
implementation to delegate: let the agent write the code, or use guided mentoring
to write it yourself.

## Installation

On Linux or macOS, copy and run:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh
```

Accept the installer's PATH setup prompt, then open a new shell and run `cr --version`.
See the [installation guide](docs/INSTALLATION.md#installation) for prerequisites,
alternative commands, and custom installation paths.

## Typical workflow

**Explore → ticket → implement → walk through → document → commit.**

Start by agreeing on what to build and the important design decisions. Turn that
understanding into small tickets, implement and verify them, then review the
changes together. Repeat as needed before updating documentation and committing.

The steps below use CodeRail's agent skills. Invoke them through your coding
agent's skill interface; names such as `explore` and `implement` are skills,
not CLI commands. Use `compass` skill with your agent whenever you need guidance
on the next step.

### 1. Set up your project

[Install CodeRail](docs/INSTALLATION.md#installation), then initialize your project
and [install the skills](docs/COMMANDS.md#agent-instructions) for Codex or Claude.
Configure [verification rules](docs/COMMANDS.md#verify-your-changes) for your
formatter, linter, type checker, and tests before starting implementation.

See [project setup](docs/COMMANDS.md#start-a-project) for the commands.

### 2. Explore the idea

Start an agent session in your project and invoke `explore` with your goal—for
example, “Add search to the documentation.” Work with the agent to clarify the
outcome, scope, behavior, and important interfaces. The agent investigates the
existing code and records agreed decisions and verification expectations in an
idea or idea tree.

Finish exploration when the consequential decisions are settled and the remaining
implementation choices can be delegated.

### 3. Create actionable tickets

Invoke `ticket` with the ready idea. The agent breaks the work into small tickets
with explicit dependencies, tasks, and validation criteria. Review the scope so
each ticket has a clear outcome.

Plan test tasks before related implementation where they validate behavior.
Type-only changes use type correctness and configured checks without placeholder
runtime tests or production helpers added solely for coverage.

### 4. Implement and verify

Invoke `implement` with a ticket, or let it select the next ready one. The agent
works through its tasks, runs the configured checks, fixes failures, and closes
the ticket after its tasks and verification pass. Repeat for the remaining tickets.

Numbered order is the default; the agent may interleave or reorder tasks while
respecting dependencies and explicit prerequisites. Every task must still meet
its validation criteria before completion.

If you want to write the code yourself, invoke `mentor` instead. It explains the
tasks, reviews your work when you are ready, and guides corrections and verification.
For unattended ticket processing with optional review and commits, see
[automated implementation](docs/AUTOMATION.md).

### 5. Walk through the changes

Stage the changes you want to review and invoke `walkthrough`. The agent explains
what changed, how it works, and the design trade-offs. Discuss improvements and
record agreed follow-up work in the idea's `REVIEW.md`.

Address that work, verify the changes, and review again as needed. This is where
you build your own understanding of the implementation.

### 6. Update documentation and commit

Invoke `docs` to bring user documentation into line with the implemented behavior.
Stage the final changes and invoke `commit` to create logically coherent commits
from the staged diff.

## Further reading

- [Installation, upgrades, and diagnostics](docs/INSTALLATION.md)
- [Commands, agent installation, configuration, and verification](docs/COMMANDS.md)
- [Automated implementation](docs/AUTOMATION.md)
- [Developing CodeRail](docs/DEVELOPMENT.md)
- [Releasing CodeRail](docs/RELEASING.md)
- [Release history](CHANGELOG.md)

## License

[AGPL-3.0-or-later](LICENSE.md)
