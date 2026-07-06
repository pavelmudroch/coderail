#!/usr/bin/env sh

set -eu

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
  gemini
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

add_tool() {
    case "$1" in
        codex|copilot|claude|gemini)
            ;;
        *)
            error "unknown tool: $1"
            ;;
    esac

    if [ -n "$tools" ]; then
        tools="${tools}
$1"
    else
        tools=$1
    fi

    tool_count=$((tool_count + 1))
}

install_force=false
tools=
tool_count=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        -f|--force)
            install_force=true
            shift
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
            add_tool "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_tool "$1"
    shift
done

[ "$tool_count" -gt 0 ] || error "missing tool"
