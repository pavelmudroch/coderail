#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket [options] <command>

  Ticket management commands for the current repository.

Options:
  -h, --help            Show this help message and exit

Commands:
  create                Create a new ticket for the current repository
  next                  List open tickets with satisfied dependencies
  close                 Close an active ticket
  activate              Activate an open ticket
  deactivate            Deactivate an active ticket
  reopen                Reopen a closed ticket
  validate              Validate tickets format
  clean                 Clean up tickets
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

run_ticket_command() {
    ticket_command=$1
    shift
    ticket_command_dir=$(
        CDPATH= cd -- "$(dirname "$0")/ticket"
        pwd
    )
    ticket_script=$ticket_command_dir/$ticket_command.sh

    [ -f "$ticket_script" ] || error "$ticket_command is not implemented"

    sh "$ticket_script" "$@"
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

[ "$#" -gt 0 ] || error "missing command"

ticket_command=$1
shift

case "$ticket_command" in
    create|next|close|activate|deactivate|reopen|validate|clean)
        run_ticket_command "$ticket_command" "$@"
        ;;
    *)
        error "unknown command: $ticket_command"
        ;;
esac
