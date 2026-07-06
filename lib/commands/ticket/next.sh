#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket next [options]

  List open tickets with satisfied dependencies for the current repository.

Options:
  -h, --help            Show this help message and exit
  --limit <N>           Limit the number of tickets to display, must be
                        a positive integer
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

set_limit() {
    [ "$limit_set" = false ] || error "--limit provided multiple times"

    case "$1" in
        ''|*[!0123456789]*)
            error "--limit must be a positive integer"
            ;;
        0)
            error "--limit must be a positive integer"
            ;;
    esac

    limit=$1
    limit_set=true
}

limit=
limit_set=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --limit=*)
            set_limit "${1#--limit=}"
            shift
            ;;
        --limit)
            shift
            [ "$#" -gt 0 ] || error "--limit requires a value"
            set_limit "$1"
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
            break
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"
