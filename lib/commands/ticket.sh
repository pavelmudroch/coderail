#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket [options] <command>

  Manage tickets.

Options:
  -h, --help           Show this help message and exit

Commands:
  create               Create a new ticket
  next                 List next available tickets
  activate             Activate an open ticket
  close                Close a ticket
  reopen               Reopen a ticket
EOF
}

execute_command()
{
    command=""
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$_CR_SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            create|next|activate|close|reopen)
                command="$1"
                shift
                break
                ;;
            -*)
                log_error "Unknown option: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    if [ -z "$command" ]; then
        log_error "No command provided"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    script="$_CR_INSTALL_DIR/lib/commands/ticket/$command.sh"
    (
        . "$script"
        execute_command "$@"
    )
}

_resolve_ticket_path()
{
    ticket="$1"
}

_lock_ticket()
{
    ticket_path="$1"
    # create a ticket lock file
}

_unlock_ticket()
{
    ticket_path="$1"
    # remove the ticket lock file
}

_read_ticket_file()
{
    ticket_path="$1"
}

_ticket_is_satisfied()
{
    :
    # check for done, or follow duplicate chain (detect cycles)
}

_ticket_dependencies_satisfied()
{
    :
    # check every dependency, re-use helper _ticket_is_satisfied
}

_merge_ticket_dependencies()
{
    :
    # combine all provided arguments into single chain string
}