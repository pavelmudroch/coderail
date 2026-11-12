# Installing and maintaining CodeRail

[Overview and workflow](../README.md) · [Installation](INSTALLATION.md) · [Commands and configuration](COMMANDS.md) · [Automation](AUTOMATION.md)

## Table of contents

- [Installation](#installation)
- [Upgrading](#upgrading)
- [Diagnosing setup problems](#diagnosing-setup-problems)

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

On Windows, use `install.ps1` with Windows PowerShell 5.1 or PowerShell 7.
The [README](../README.md#installation) includes commands for both PowerShell
and Command Prompt; both run the same PowerShell installer. It supports x86_64
and ARM64 and defaults to `%USERPROFILE%\.coderail`. Set `CODERAIL_INSTALL_ROOT`
to choose another directory.

Both installers download the latest stable release and verify its SHA-256 checksum.
The Linux and macOS default is `~/.coderail`. To choose another directory, pass
`CODERAIL_INSTALL_ROOT` to the shell running the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | CODERAIL_INSTALL_ROOT="$HOME/.local/share/coderail" sh
```

In PowerShell, set the environment variable before running the installer:

```powershell
$env:CODERAIL_INSTALL_ROOT = "$env:LOCALAPPDATA\coderail"
irm https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.ps1 | iex
```

The installer asks before adding its `bin` directory to PATH. Accept the prompt
and open a new shell, then check the installation:

```sh
cr --version
cr --help
```

If you skip PATH setup, follow the printed instructions or run
`~/.coderail/bin/cr` directly, or `& "$env:USERPROFILE\.coderail\bin\cr.cmd"`
in PowerShell for the default Windows root. Running the installer again upgrades
or reconciles the selected installation with the latest stable release.

A healthy installation uses its existing CLI for the upgrade without downloading
another bootstrap executable. A broken or incomplete installation downloads a
verified bootstrap and applies the usual upgrade conflict checks. The installer
does not force overwrites: resolve reported conflicts before rerunning it. User
created templates and unrelated files are preserved. A different
`CODERAIL_INSTALL_ROOT` creates a separate installation; it does not move an
existing one.

On Linux and macOS, piped installation can ask for PATH consent through a
controlling terminal. Without a terminal, it prints manual setup instructions.
To explicitly skip prompts and shell configuration edits, run:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh -s -- --non-interactive
```

On Windows, save `install.ps1` locally and run
`.\install.ps1 --non-interactive` from PowerShell to skip prompts and PATH edits.

PATH setup belongs to `cr upgrade` and exposes only the selected root's `bin`
directory. If editing your shell configuration fails, installation still succeeds
and prints manual instructions. Open a new shell or reload the indicated profile
after setup; the installer cannot update its parent shell's environment.

If installation fails or is interrupted, it removes its temporary downloads and
unused bootstrap executable. Files already installed, active executables and user
data remain in place; there is no automatic rollback. Fix the reported issue and
rerun the installer to repair the selected root.

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

Interactive upgrades show download progress for the release archive and checksum.
Upgrade summaries on stderr report completed write, removal, and skipped-file
counts, plus whether the distribution manifest was saved. Use `cr --verbose upgrade`
to include the corresponding file paths; `--quiet` suppresses these summaries.
The activation result remains on stdout.

If an upgrade fails after changes begin, it reports partial progress and whether
activation completed. Failures while switching the launcher retain the completed
asset counts and manifest status. There is no automatic rollback; follow the
reported recovery instructions and preserve user templates before removing an
installation root.

After activation, CodeRail offers to add the installation's `bin` directory to PATH.
This requires separate consent, including when overwrite flags are supplied.
Bash uses `~/.bashrc`, Zsh uses `~/.zshrc`, and Fish uses
`~/.config/fish/config.fish`. Windows updates the current user's PATH.
Open a new shell after setup.

Piped stdin can use a controlling terminal for consent. Without a terminal, or with
`--non-interactive`, CodeRail prints manual instructions without editing PATH.
Unsupported shells also receive manual instructions. If PATH setup fails, use the
executable's full path and follow the printed instructions to finish setup.

## Diagnosing setup problems

Run read-only diagnostics from any directory, including outside a project or when
configuration is invalid:

```sh
cr doctor
cr --cwd /path/to/project doctor
cr --verbose doctor
```

Doctor checks:

- Installation resource readability and, for packaged installations, the
  distribution manifest, owned file integrity, launcher target, and installation
  `bin` directory on PATH. Missing optional resource directories are allowed.
- The nearest ancestor project with a `.coderail` directory, including incomplete
  initialization: required configuration and ignore rules are checked without
  falling back to an outer project.
- Global and project configuration files and environment overrides. In source
  development mode, the source repository's `.coderail/config` is also validated;
  its settings apply only when it is the selected project.
- Installed Codex and Claude instruction manifests and owned files, both globally
  and in the selected project. A missing instruction manifest is allowed.
- The configured default harness executable on PATH, including execute access on
  Unix and extension lookup through PATHEXT on Windows. Doctor does not launch the
  harness or check authentication, model access, or network connectivity.

Installation checks run before project discovery and configuration validation.
Independent checks continue after failures; unavailable dependent checks are
reported as skipped. Outside a project, project and local instruction checks are
skipped. With no default harness configured, the executable check is skipped.
If any configuration source is invalid, Doctor reports its errors and continues
with built-in defaults plus explicit global CLI flags.

The final report on stdout lists failures, manual repair guidance, and skipped
checks, even with `--quiet`. Exit status is `1` if any check fails and `0`
otherwise; skipped checks alone do not fail the command.
Use `--verbose` to show progress and diagnostic paths on stderr from the start.
Verbosity from valid configuration takes effect after configuration validation.

Doctor does not modify files. Follow the reported manual repair steps and rerun
the checks. `cr doctor --repair` is accepted but remains unimplemented.
