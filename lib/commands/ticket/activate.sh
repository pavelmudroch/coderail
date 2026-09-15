#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr ticket activate [options] <ticket>

  Activate an existing ticket by its ID, path or slug.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <ticket>             The ID, path or slug of the ticket to activate
EOF
}

execute_command()
{
    ticket=""

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
            --)
                shift
                break
                ;;
            -*)
                log_error "Unknown option: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            *)
                if [ -n "$ticket" ]; then
                    log_error "Multiple tickets provided"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                ticket="$1"
                ;;
        esac
        shift
    done

    if [ -z "$ticket" ]; then
        if [ $# -eq 0 ]; then
            log_error "Required ticket argument is missing"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi
        if [ $# -gt 1 ]; then
            log_error "Multiple tickets provided"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi
        ticket="$1"
        shift
    fi

    if [ $# -gt 0 ]; then
        log_error "Multiple tickets provided"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if ! ticket_path="$(_resolve_ticket_path "$ticket" 2>&1)"; then
        log_error "Failed to resolve ticket \"$ticket\": $ticket_path"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! _lock_ticket "$ticket_path" 2>/dev/null; then
        log_error "Failed to lock ticket: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi
    trap '_unlock_ticket "$ticket_path"' 0
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM

    if ! ticket_content="$(_read_ticket_file "$ticket_path")"; then
        log_error "Failed to read ticket \"$ticket_path\": $ticket_content"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    status=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "$TICKET_STATUS_KEY")
    if [ "${ticket_path%/*}" != "$TICKETS_PATH/open" ] || [ "$status" != "$TICKET_STATUS_OPEN" ]; then
        log_error "Ticket is not open: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! _ticket_dependencies_satisfied "$ticket_path"; then
        log_error "Ticket dependencies are not satisfied: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    active_ticket_path="$TICKETS_PATH/active/${ticket_path##*/}"
    if [ -e "$active_ticket_path" ] || [ -L "$active_ticket_path" ]; then
        log_error "Ticket already exists at path: \"$active_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! fs_make_dir "$TICKETS_PATH/active"; then
        log_error "Cannot write to \"$TICKETS_PATH/active\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! md_frontmatter_set "$TICKET_STATUS_KEY" "$TICKET_STATUS_ACTIVE" < "$ticket_path" \
        | md_frontmatter_remove "$TICKET_REASON_KEY" \
        | md_frontmatter_remove "$TICKET_DUPLICATE_OF_KEY" \
        | fs_write "$active_ticket_path"
    then
        log_error "Failed to write active ticket: \"$active_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! rm -f "$ticket_path"; then
        rm -f "$active_ticket_path"
        log_error "Failed to remove open ticket: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "$active_ticket_path"
}
