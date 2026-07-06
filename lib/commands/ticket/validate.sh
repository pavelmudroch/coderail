#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket validate [options] [<ticket> ...]

  Validate the format of tickets for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket(s) to validate, specified by their ID, name, or path.
              If no tickets are specified, all tickets will be validated.
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

add_ticket_reference() {
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    if [ -n "$ticket_references" ]; then
        ticket_references="${ticket_references}
$1"
    else
        ticket_references=$1
    fi

    ticket_reference_count=$((ticket_reference_count + 1))
}

ticket_references=
ticket_reference_count=0

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
            add_ticket_reference "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_ticket_reference "$1"
    shift
done
