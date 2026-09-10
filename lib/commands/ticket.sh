#!/usr/bin/env sh

TICKETS_PATH=".coderail/tickets"
TICKET_STATUS_OPEN="open"
TICKET_STATUS_ACTIVE="active"
TICKET_STATUS_CLOSED="closed"

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
        _ensure_tickets_dir
        . "$script"
        execute_command "$@"
    )
}

_ensure_tickets_dir()
{
    if ! fs_make_dir "$TICKETS_PATH"; then
        log_error "Failed to create \"$TICKETS_PATH\" directory"
        return 1
    fi
}

_resolve_ticket_path()
{
    ticket="$1"
    resolved_path=""

    for ticket_path in "$TICKETS_PATH"/open/*.md \
        "$TICKETS_PATH"/active/*.md \
        "$TICKETS_PATH"/close/*.md
    do
        [ -f "$ticket_path" ] || continue
        ticket_slug="${ticket_path##*/}"
        ticket_slug="${ticket_slug%.md}"
        ticket_id="${ticket_slug%%-*}"
        ticket_title_slug="${ticket_slug#*-}"

        case "$ticket" in
            "$ticket_id"|"$ticket_title_slug"|"$ticket_slug")
                if [ -n "$resolved_path" ]; then
                    printf 'Multiple occurrences found\n' >&2
                    return 1
                fi
                resolved_path="$ticket_path"
                ;;
        esac
    done

    if [ -z "$resolved_path" ]; then
        printf 'Not found\n' >&2
        return 1
    fi

    printf '%s\n' "$resolved_path"
}

_lock_ticket()
(
    ticket_path="$1"
    set -C
    : > "$TICKETS_PATH/~${ticket_path##*/}.lock"
)

_unlock_ticket()
{
    ticket_path="$1"
    rm -f "$TICKETS_PATH/~${ticket_path##*/}.lock"
}

_read_ticket_file()
{
    ticket_file="$1"

    if [ ! -f "$ticket_file" ]; then
        echo "File does not exist"
        return 1
    fi

    if ! ticket_content=$(cat "$ticket_file" 2>&1); then
        echo "$ticket_file"
        return 1
    fi

    if ! message="$(md_is_frontmatter_valid "$ticket_content")"; then
        echo "Invalid frontmatter: \"$message\""
        return 1
    fi

    echo "$ticket_content"
}

_ticket_is_satisfied()
(
    ticket_path="$1"
    set --

    while :; do
        for visited_path in "$@"; do
            [ "$visited_path" != "$ticket_path" ] || return 1
        done
        set -- "$@" "$ticket_path"

        ticket_content=$(_read_ticket_file "$ticket_path" 2>/dev/null) || return 1
        status=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "status") || return 1
        [ "$status" = "$TICKET_STATUS_CLOSED" ] || return 1
        reason=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "reason") || return 1

        case "$reason" in
            done)
                return 0
                ;;
            duplicate)
                duplicate_of=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "duplicate-of") || return 1
                [ -n "$duplicate_of" ] || return 1
                ticket_path=$(_resolve_ticket_path "$duplicate_of" 2>/dev/null) || return 1
                ;;
            *)
                return 1
                ;;
        esac
    done
)

_ticket_dependencies_satisfied()
{
    ticket_path="$1"
    # check every dependency, re-use helper _ticket_is_satisfied
}

_merge_ticket_dependencies()
{
    dependencies=""
    while [ $# -gt 0 ]; do
        if [ -z "$dependencies" ]; then
            dependencies="$1"
        else
            dependencies="$dependencies, $1"
        fi
        shift
    done

    printf '%s\n' "$dependencies"
}
