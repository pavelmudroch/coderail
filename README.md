# CodeRail

CodeRail helps you stay involved in the development loop with coding agents, so
you understand what was built, how the system works, and the public APIs and
interfaces it exposes—even when an agent implements most of it autonomously.

Use the `cr` command-line tool to organize ideas and tickets in your project and
run verification commands for the files you change.

## Table of Contents

- [Installation](#installation)
- [Start a project](#start-a-project)
- [Ideas and tickets](#ideas-and-tickets)
- [Verify your changes](#verify-your-changes)
- [Upgrading](#upgrading)
- [Contributing](#contributing)
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
is simulated. Harness instruction installation and removal (`cr install` and
`cr uninstall`) have unfinished Codex and Claude connectors.

## Contributing

See [Developing CodeRail](DEVELOPMENT.md) for source checks and tooling, and
[Releasing CodeRail](RELEASING.md) for shipping, packaging, and publication.
See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[AGPL-3.0-or-later](LICENSE.md)
