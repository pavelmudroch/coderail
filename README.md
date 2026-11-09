# CodeRail

CodeRail helps you stay involved in the development loop with coding agents, so
you understand what was built, how the system works, and the public APIs and
interfaces it exposes—even when an agent implements most of it autonomously.

Use the `cr` command-line tool to organize ideas and tickets in your project and
run verification commands for the files you change.

## Table of Contents

- [Installation](#installation)
- [Start a project](#start-a-project)
- [Agent instructions](#agent-instructions)
- [Typical workflow](#typical-workflow)
- [Ideas and tickets](#ideas-and-tickets)
- [Verify your changes](#verify-your-changes)
- [Upgrading](#upgrading)
- [Help & Current Limitations](#command-help-and-current-limitations)
- [Contributing](#contributing)
- [License](#license)

## Installation

On Linux or macOS, download and run `install.sh` with either command:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh
```

```sh
wget -qO- https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh
```

The installer supports x86_64 and ARM64 on Linux (GNU) and macOS. It requires
either `curl` or `wget`, plus `jq`, `unzip`, and either `sha256sum` or `shasum`,
along with standard shell utilities. The installer prefers `curl` and falls back
to `wget` when `curl` is unavailable. You do not need Deno or Bun to run the packaged CLI.

Installation downloads the latest stable release, verifies its SHA-256 checksum,
and installs into `~/.coderail` by default. To choose another directory, pass
`CODERAIL_INSTALL_ROOT` to the shell running the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | CODERAIL_INSTALL_ROOT="$HOME/.local/share/coderail" sh
```

The installer asks before adding its `bin` directory to PATH. Accept the prompt
and open a new shell, then check the installation:

```sh
cr --version
cr --help
```

If you skip PATH setup, follow the printed instructions or run
`~/.coderail/bin/cr` directly. Running the installer again upgrades or reconciles
the selected installation with the latest stable release.

A healthy installation uses its existing CLI for the upgrade without downloading
another bootstrap executable. A broken or incomplete installation downloads a
verified bootstrap and applies the usual upgrade conflict checks. The installer
does not force overwrites: resolve reported conflicts before rerunning it. User
created templates and unrelated files are preserved. A different
`CODERAIL_INSTALL_ROOT` creates a separate installation; it does not move an
existing one.

Piped installation can ask for PATH consent through a controlling terminal.
Without a terminal, it prints manual setup instructions. To explicitly skip
prompts and shell configuration edits, run:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh -s -- --non-interactive
```

PATH setup belongs to `cr upgrade` and exposes only the selected root's `bin`
directory. If editing your shell configuration fails, installation still succeeds
and prints manual instructions. Open a new shell or reload the indicated profile
after setup; the installer cannot update its parent shell's environment.

If installation fails or is interrupted, it removes its temporary downloads and
unused bootstrap executable. Files already installed, active executables and user
data remain in place; there is no automatic rollback. Fix the reported issue and
rerun the installer to repair the selected root. Windows installation through
PowerShell is not yet supported.

## Start a project

Run these commands from your project's root directory:

```sh
cd /path/to/your/project
cr init
cr ticket create "Add a search page"
cr ticket next
```

`cr init` creates `.coderail/coderail.conf` without replacing an existing
configuration. Tickets and ideas are Markdown files under `.coderail`, so you can
edit their contents and keep them in version control alongside your code.

## Agent instructions

Install CodeRail's bundled skills and subagents for Codex or Claude:

```sh
cr install codex
cr install claude
```

Installation is global by default. Use `--local` from an initialized project to
install into that project instead:

```sh
cr install --local codex
cr uninstall --local codex
```

You can name both harnesses in one command. If you omit the harness, CodeRail uses
`default_harness` from configuration; for example, `default_harness = codex`.

| Harness | Global home | Project-local destinations |
| --- | --- | --- |
| Codex | `~/.codex`, or absolute `CODEX_HOME` | `.codex/skills/`, `.codex/agents/`, and `AGENTS.md` |
| Claude | `~/.claude`, or absolute `CLAUDE_CONFIG_DIR` | `.claude/skills/`, `.claude/agents/`, and `.claude/rules/coderail.md` |

Global skills and subagents go into `skills/` and `agents/` under the harness
home. General instructions, when bundled, become Codex `AGENTS.md` or Claude
`rules/coderail.md`. Codex subagents are generated as TOML files; Claude subagents
remain Markdown. Local operations ignore global home overrides and target the
nearest ancestor containing `.coderail`, including when invoked from a subdirectory.

CodeRail tracks installed files in a separate `.coderail-install` manifest for
each harness and scope. Unchanged owned files update without prompts; existing
unowned files and modified owned files require `--force` and confirmation.
For unattended conflict handling, combine `--force` with `--yes` to approve or
`--no` to decline. Codex `AGENTS.md` is managed as a whole file, without merging
existing project instructions.

`cr uninstall <harness>` removes owned instruction files in the selected scope.
Modified files require the same force and confirmation options; unrelated files
are preserved. Missing instruction sources are allowed, and omitted skills are
left installed. Reinstalling a present Codex skill whose invocation flag was
removed retires its obsolete owned invocation-policy file under the same protections.

## Typical workflow

Use CodeRail's skills with your coding agent to move from an idea to reviewed,
committed changes. Invoke skills through your agent's skill interface; names such
as `explore` and `implement` refer to agent skills, not `cr` subcommands.

1. **Initialize the project.** Run `cr init` from the project root.
2. **Configure verification.** Edit `.coderail/coderail.conf` to define the checks
   your project needs, such as formatting, linting, type checking, and tests. See
   [Verify your changes](#verify-your-changes) for rule syntax and examples. Set
   these up before implementation so the agent can validate its work.
3. **Install instructions and start an agent session.** Use `cr install codex` or
   `cr install claude` (add `--local` for this project only). Give the agent your
   goal and relevant project context, then invoke the skills below as work
   progresses.
4. **Explore.** Use `explore` to clarify the outcome, investigate the existing
   code, and agree on scope, behavior, important interfaces, and verification
   expectations. The agent records these decisions in an implementation-ready
   idea or idea tree.
5. **Create tickets.** Use `ticket` to turn the agreed design into small,
   actionable tickets with explicit dependencies and validation criteria.
6. **Implement and repeat.** Use `implement` with a ticket or let it select the
   next ready ticket. The agent implements its tasks, runs configured
   verification, fixes failures, and closes the ticket once it passes. Repeat
   this loop for the remaining tickets; `cr loop` is currently a placeholder.
7. **Walk through the changes.** Stage the changes you want to review, then use
   `walkthrough` to understand the implementation and discuss improvements with
   the agent. It records agreed follow-up work in the idea's `REVIEW.md`. Address
   that work, verify any changes, and review again as needed.
8. **Update documentation.** Use `docs` to synchronize user documentation with
   the implemented behavior.
9. **Commit.** Stage the final reviewed changes and use `commit` to create
   logically coherent commits from the staged diff.

## Ideas and tickets

Capture an idea and display the idea tree:

```sh
cr idea create "Improve search"
cr idea
```

Use `cr idea ready <idea>` when an idea is ready for further processing,
`cr idea split <idea> "First part" "Second part"` to divide it, or
`cr idea reopen <idea>` to reopen it. Use the idea identifier returned by the CLI.

Tickets track implementation work. After creating a ticket, use its returned ID
in subsequent commands; for example, if the ID is `0001`:

```sh
cr ticket next --limit 1
cr ticket activate 0001
cr ticket close 0001
```

`cr ticket next` lists open tickets whose dependencies are satisfied, ordered by ID.
Create a dependent ticket with `cr ticket create --depends-on 0001 "Add search filters"`.
Use `cr ticket reopen 0001` to reopen a closed ticket. Idea and ticket commands
support `--json` for scripts.

## Verify your changes

Configure verification rules in `.coderail/coderail.conf`. For example, a project
using Deno can check each TypeScript source file with:

```toml
[[verify.rules]]
pattern = "src/${path:**/}${file:*}.ts"
commands = [
    ["deno", "check", "src/${path}${file}.ts"]
]
```

The pattern captures directory and file names for substitution into command
arguments. Replace the example command with your project's checks; any tools
used by a rule must be installed separately.

```sh
cr verify ./src/main.ts
cr verify ./src
cr verify --changed
cr verify --short --changed
```

`--changed` selects files changed in Git. Files without applicable commands are
reported as `skipped`. Matching commands run from the project root, and duplicate
command results are reused. Rules can also declare `requires` paths; a rule is
skipped when its required files are missing. Optional `[verify]` `pre` and `post`
command arrays run once around matching work; place that section before rule entries.

## Upgrading

```sh
cr upgrade
cr upgrade --list
cr upgrade --version 0.1.0
cr upgrade --canary
```

`cr upgrade` installs the latest stable release or reconciles the current version.
`--list` shows published stable versions without changing the installation.
`--version` accepts a major, major.minor, or exact version; exact versions also
allow downgrades. `--canary` selects the latest unreleased build.

Unchanged managed files update without prompts, and user templates are preserved.
Conflicting files require `--force` and confirmation. For non-interactive conflict
handling, combine `--force` with `--yes` to approve or `--no` to decline.

After activation, CodeRail offers to add the installation's `bin` directory to PATH.
This requires separate consent, including when overwrite flags are supplied.
Bash uses `~/.bashrc`, Zsh uses `~/.zshrc`, and Fish uses
`~/.config/fish/config.fish`. Windows updates the current user's PATH.
Open a new shell after setup.

Piped stdin can use a controlling terminal for consent. Without a terminal, or with
`--non-interactive`, CodeRail prints manual instructions without editing PATH.
Unsupported shells also receive manual instructions. If PATH setup fails, use the
executable's full path and follow the printed instructions to finish setup.

## Command help and current limitations

Use `cr --help`, `cr <command> --help`, or a subcommand's help, such as
`cr ticket close --help`, for available options. Global options include
`--cwd <path>`, `--non-interactive`, `--no-color`, `--verbose`, and `--quiet`.
For example, `cr --cwd /path/to/project ticket next` selects another project.

Some commands listed in help are still under development: `loop`, `doctor`, and
`template` are placeholders, and template installation through `cr init <template>`
is simulated.

## Contributing

See [Developing CodeRail](DEVELOPMENT.md) for source checks and tooling, and
[Releasing CodeRail](RELEASING.md) for shipping, packaging, and publication.
See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[AGPL-3.0-or-later](LICENSE.md)
