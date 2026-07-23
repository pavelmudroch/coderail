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
  cr work <command>

  Management helper for new work (feature/fix/...) on current repository.

Options:
  -h, --help            Show this help message and exit

Commands:
  start                 Starts the new work
  finish                Complete the finished work
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