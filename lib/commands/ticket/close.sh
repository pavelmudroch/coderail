#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket close [options] <ticket>

  Close an active ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  --reason <reason>
                        The reason for closing the ticket. Can be one of:
                        done, duplicate, deferred, dismissed
                        (default: done)

Arguments:
  <ticket>    The ticket to close, specified by its ID, name, or path
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

set_close_reason() {
    [ "$close_reason_set" = false ] || error "--reason provided multiple times"

    case "$1" in
        done|duplicate|deferred|dismissed)
            close_reason=$1
            close_reason_set=true
            ;;
        *)
            error "invalid close reason: $1"
            ;;
    esac
}

set_ticket_reference() {
    [ -z "$ticket_reference" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    ticket_reference=$1
}

close_reason=done
close_reason_set=false
ticket_reference=

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --reason=*)
            set_close_reason "${1#--reason=}"
            shift
            ;;
        --reason)
            shift
            [ "$#" -gt 0 ] || error "--reason requires a value"
            set_close_reason "$1"
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
