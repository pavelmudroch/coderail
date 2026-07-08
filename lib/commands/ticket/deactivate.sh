#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../../.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"
. "$ROOT_DIR/lib/utils/ticket.sh"
. "$ROOT_DIR/lib/utils/ticket_open.sh"

usage() {
    cat <<'EOF'
Usage:
  cr ticket deactivate [options] <ticket>

  Deactivate an active ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  -d <ticket>, --depends-on <ticket>
                        Specify a ticket that this deactivated ticket depends on.
                        Can be specified multiple times to add multiple dependencies.
                        Accepts ticket ID, name, or path.

Arguments:
  <ticket>    The ticket to deactivate, specified by its ID, name, or path
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    log_error "$@"
    exit 1
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

set_ticket_reference() {
    [ -z "$ticket_reference" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    ticket_reference=$1
}

depends_on=
ticket_reference=

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

project_dir=.

log_notice "locating ticket: $ticket_reference"
ticket_path=$(ticket_resolve_reference "$project_dir" "$ticket_reference")
ticket_file=$project_dir/$ticket_path
log_notice "located ticket: $ticket_path"

log_notice "validating ticket: $ticket_path"
ticket_validate_file "$project_dir" "$ticket_file"

log_notice "verifying active ticket: $ticket_path"
if ! ticket_is_state "$ticket_file" active; then
    fatal "ticket must be active: $ticket_path"
fi
log_notice "verified active ticket: $ticket_path"

log_notice "moving ticket to open: $ticket_path"
open_ticket_path=$(ticket_open_with_dependencies "$project_dir" "$ticket_file" "$depends_on")
log_notice "deactivated ticket: $open_ticket_path"

printf '%s\n' "$open_ticket_path"
