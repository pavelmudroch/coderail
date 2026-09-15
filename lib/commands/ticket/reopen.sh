#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr ticket reopen [options] <ticket>

  Reopen an existing ticket by its ID, path or slug.

Options:
  -h, --help           Show this help message and exit
  -d, --depends-on <ticket>
                       The ticket id, path or ticket slug this ticket depends on
                       Can be specified multiple times for multiple dependencies
                       Serves as additional dependencies for the ticket being
                       reopened, does not replace existing dependencies

Arguments:
  <ticket>             The ID, path or slug of the ticket to reopen
EOF
}

execute_command()
{
    ticket=""
    depends_on_tickets=""
    first=1

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
            -d|--depends-on)
                shift
                if [ -z "${1-}" ]; then
                    log_error "Missing argument for --depends-on option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                if [ $first -eq 1 ]; then
                    depends_on_tickets="$1"
                    first=0
                else
                    depends_on_tickets="$depends_on_tickets$EOL$1"
                fi
                ;;
            --depends-on=*)
                value="${1#*=}"
                if [ -z "$value" ]; then
                    log_error "Missing argument for --depends-on option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                if [ $first -eq 1 ]; then
                    depends_on_tickets="$value"
                    first=0
                else
                    depends_on_tickets="$depends_on_tickets$EOL$value"
                fi
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
    if [ "${ticket_path%/*}" != "$TICKETS_PATH/close" ] || [ "$status" != "$TICKET_STATUS_CLOSED" ]; then
        log_error "Ticket is not closed: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    depends_on=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "$TICKET_DEPENDS_ON_KEY")
    set -- "$depends_on"
    while IFS= read -r dependency; do
        [ -n "$dependency" ] || continue
        if ! dependency_path="$(_resolve_ticket_path "$dependency" 2>&1)"; then
            log_error "Failed to resolve dependency \"$dependency\": $dependency_path"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        if [ "$dependency_path" = "$ticket_path" ]; then
            log_error "Ticket cannot depend on itself: \"$ticket_path\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        dependency_slug="${dependency_path##*/}"
        set -- "$@" "${dependency_slug%%-*}"
    done <<EOF
$depends_on_tickets
EOF
    depends_on="$(_merge_ticket_dependencies "$@")"

    open_ticket_path="$TICKETS_PATH/open/${ticket_path##*/}"
    if [ -e "$open_ticket_path" ] || [ -L "$open_ticket_path" ]; then
        log_error "Ticket already exists at path: \"$open_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! fs_make_dir "$TICKETS_PATH/open"; then
        log_error "Cannot write to \"$TICKETS_PATH/open\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! md_frontmatter_set "$TICKET_STATUS_KEY" "$TICKET_STATUS_OPEN" < "$ticket_path" \
        | md_frontmatter_remove "$TICKET_REASON_KEY" \
        | md_frontmatter_remove "$TICKET_DUPLICATE_OF_KEY" \
        | md_frontmatter_set "$TICKET_DEPENDS_ON_KEY" "$depends_on" \
        | fs_write "$open_ticket_path"
    then
        log_error "Failed to write open ticket: \"$open_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! rm -f "$ticket_path"; then
        rm -f "$open_ticket_path"
        log_error "Failed to remove source ticket: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "$open_ticket_path"
}
