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

project_dir=.

log_notice "locating ticket: $ticket_reference"
ticket_path=$(ticket_resolve_reference "$project_dir" "$ticket_reference")
ticket_file=$project_dir/$ticket_path
log_notice "located ticket: $ticket_path"

log_notice "validating ticket: $ticket_path"
ticket_validate_file "$project_dir" "$ticket_file"

log_notice "verifying open ticket: $ticket_path"
if ! ticket_is_state "$ticket_file" open; then
    log_error "ticket must be open: $ticket_path"
    exit 1
fi
log_notice "verified open ticket: $ticket_path"

log_notice "moving ticket to active: $ticket_path"
active_ticket_path=$(ticket_move_to_state "$project_dir" "$ticket_file" active)
log_notice "activated ticket: $active_ticket_path"

printf '%s\n' "$active_ticket_path"
