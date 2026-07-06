#!/usr/bin/env sh

set -eu

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

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            break
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"
