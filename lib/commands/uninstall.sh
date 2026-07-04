#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr uninstall [options] <tool ...>

  Uninstall instructions for selected agent-based tool.

Options:
  -h, --help            Show this help message and exit
  -f, --force           Allow removing untracked and modified existing
                        installation files

Tools:
  codex
  copilot
  claude
EOF
}