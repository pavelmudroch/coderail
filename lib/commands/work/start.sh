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
  cr work start <work-name>

  Start new work with given name. Automatically creates new git branch named
  'coderail/<slugified-work-name> and switches to it. Nothing is automatically
  pushed to remote, all stays local, user must push manually.
  This command requires clean git working tree.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <work-name>           The name of the planned work, will be slugified
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