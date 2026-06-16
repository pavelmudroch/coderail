#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr install [options] <tool>

  Install instructions for specific agent-based tool

Options:
  --help                Show this help message and exit
  --force               Override previously installed files

Tools:
  codex
  copilot
  claude
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 1
}

set_tool() {
    [ -z "$tool" ] || error "unexpected argument: $1"

    case "$1" in
        codex|copilot|claude)
            tool=$1
            ;;
        *)
            error "unsupported tool: $1"
            ;;
    esac
}

argument_count=$#
tool=
force=false

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
        --force)
            [ "$force" = false ] || error "--force provided multiple times"
            force=true
            shift
            ;;
        --force=*)
            error "--force does not accept a value"
            ;;
        --*)
            error "unknown option: $1"
            ;;
        *)
            set_tool "$1"
            shift
            ;;
    esac
done

[ -n "$tool" ] || error "missing tool"

:
