#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket create [options] <name>

  Create a new ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  -d <ticket>, --depends-on <ticket>
                        Specify a ticket that this new ticket depends on. Can be
                        specified multiple times to add multiple dependencies.
                        Accepts ticket ID, name, or path.

Arguments:
  <name>                The name of the ticket to create
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

add_dependency() {
    [ -n "$1" ] || error "--depends-on requires a non-empty value"

    if [ -n "$depends_on" ]; then
        depends_on="${depends_on}
$1"
    else
        depends_on=$1
    fi
}

set_ticket_name() {
    [ -z "$ticket_name" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<name> requires a non-empty value"

    ticket_name=$1
}

depends_on=
ticket_name=

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --depends-on=*)
            add_dependency "${1#--depends-on=}"
            shift
            ;;
        -d|--depends-on)
            shift
            [ "$#" -gt 0 ] || error "--depends-on requires a value"
            add_dependency "$1"
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
            set_ticket_name "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    set_ticket_name "$1"
    shift
done

[ -n "$ticket_name" ] || error "missing name"
