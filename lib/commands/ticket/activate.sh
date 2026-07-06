#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket activate [options] <ticket>

  Activate an open ticket for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket to activate, specified by its ID, name, or path
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

set_ticket_reference() {
    [ -z "$ticket_reference" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    ticket_reference=$1
}

ticket_reference=

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
            set_ticket_reference "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    set_ticket_reference "$1"
    shift
done

[ -n "$ticket_reference" ] || error "missing ticket"
