#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr install [options] [<harness> ...]

  Install instruction set for the specified harnesses

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force installation, overwriting user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt

Arguments:
  <harness>             One or more harnesses to install instruction sets for,
                        currently supported harnesses are:
                        codex | claude | copilot | gemini
EOF
}

execute_command()
{
    usage()
}
