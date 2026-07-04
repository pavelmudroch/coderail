#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr init [options]

  Initialize current working directory for coderail agent-based development.

  Initialization will create a .coderail directory filled with template
  configuration files for the project. And ticket management directory.

Options:
  -h, --help            Show this help message and exit
EOF
}