#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr install [options] <tool ...>

  Install instructions for specific agent-based tool.

Options:
  -h, --help            Show this help message and exit
  -f, --force           Allow overwriting untracked and modified existing
                        installation files

Tools:
  codex
  copilot
  claude
EOF
}