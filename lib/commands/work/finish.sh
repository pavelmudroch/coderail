#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

usage() {
    cat <<'EOF'
Usage:
  cr work finish

  Finish the current work. Requires all tickets to be closed, no git unstaged
  changes or untracked files. Cleans up stale coderail files and merges squashed
  back to initial branch.

Options:
  -h, --help            Show this help message and exit
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    echo "error: $*" >&2
    exit 1
}