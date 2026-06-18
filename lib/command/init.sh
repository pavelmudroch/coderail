#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr init [options]

  Initialize CodeRail configuration in the current working directory.

Options:
  --help                Show this help message and exit
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 1
}

argument_count=$#

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help)
            [ "$argument_count" -eq 1 ] || error "--help must be the only argument"
            usage
            exit 0
            ;;
        --help=*)
            error "--help does not accept a value"
            ;;
        --*)
            error "unknown option: $1"
            ;;
        *)
            error "unexpected argument: $1"
            ;;
    esac
done

:
