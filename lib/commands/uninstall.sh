#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr uninstall [options] [<harness> ...]

  Uninstall instruction set for the specified harnesses, or coderail itself

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force uninstallation, removing user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt
      --self            Uninstall coderail itself, cannot be combined with
                        harness

Arguments:
  <harness>             One or more harnesses to uninstall instruction sets for,
                        currently supported harnesses are:
                        codex | claude | copilot | gemini
EOF
}

execute_command()
{
    usage
}
