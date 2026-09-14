#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr ticket close [options] <ticket>

  Close an existing ticket by its ID or slug.

Options:
  -h, --help           Show this help message and exit
  --reason <done | duplicate | deferred | dismissed>
                       The reason for closing the ticket (defaults to "done")
  --duplicate-of <ticket>
                       The ticket ID or slug that this ticket is a duplicate of,
                       only valid when --reason is set to "duplicate"

Arguments:
  <ticket>             The ID or slug of the ticket to close
EOF
}

execute_command()
{
    ticket=""
    reason="done"
    duplicate_of=""

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
            --reason)
                shift
                if [ -z "${1-}" ]; then
                    log_error "Missing argument for --reason option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                reason="$1"
                ;;
            --duplicate-of)
                shift
                if [ -z "${1-}" ]; then
                    log_error "Missing argument for --duplicate-of option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                duplicate_of="$1"
                ;;
            --duplicate-of=*)
                value="${1#*=}"
                if [ -z "$value" ]; then
                    log_error "Missing argument for --duplicate-of option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                duplicate_of="$value"
                ;;
            --reason=*)
                value="${1#*=}"
                if [ -z "$value" ]; then
                    log_error "Missing argument for --reason option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                reason="$value"
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

    case "$reason" in
        done|duplicate|deferred|dismissed)
            ;;
        *)
            log_error "Invalid reason: $reason"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
            ;;
    esac

    if [ -n "$duplicate_of" ] && [ "$reason" != "duplicate" ]; then
        log_error "--duplicate-of option is only valid when --reason is set to \"duplicate\""
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if [ "$reason" = "duplicate" ] && [ -z "$duplicate_of" ]; then
        log_error "--duplicate-of option is required when --reason is set to \"duplicate\""
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
    if { [ "${ticket_path%/*}" != "$TICKETS_PATH/open" ] || [ "$status" != "$TICKET_STATUS_OPEN" ]; } &&
        { [ "${ticket_path%/*}" != "$TICKETS_PATH/active" ] || [ "$status" != "$TICKET_STATUS_ACTIVE" ]; }
    then
        log_error "Ticket is not open or active: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if [ "$reason" = "done" ]; then
        if [ "$status" != "$TICKET_STATUS_ACTIVE" ]; then
            log_error "Ticket is not active: \"$ticket_path\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        if ! _ticket_dependencies_satisfied "$ticket_path"; then
            log_error "Ticket dependencies are not satisfied: \"$ticket_path\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    if [ "$reason" = "duplicate" ]; then
        if ! duplicate_path="$(_resolve_ticket_path "$duplicate_of" 2>&1)"; then
            log_error "Failed to resolve duplicate ticket \"$duplicate_of\": $duplicate_path"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        if [ "$duplicate_path" = "$ticket_path" ]; then
            log_error "Ticket cannot be a duplicate of itself: \"$ticket_path\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        duplicate_slug="${duplicate_path##*/}"
        duplicate_of="${duplicate_slug%%-*}"
    fi

    closed_ticket_path="$TICKETS_PATH/close/${ticket_path##*/}"
    if [ -e "$closed_ticket_path" ] || [ -L "$closed_ticket_path" ]; then
        log_error "Ticket already exists at path: \"$closed_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! fs_make_dir "$TICKETS_PATH/close"; then
        log_error "Cannot write to \"$TICKETS_PATH/close\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! md_frontmatter_set "$TICKET_STATUS_KEY" "$TICKET_STATUS_CLOSED" < "$ticket_path" \
        | md_frontmatter_set "$TICKET_REASON_KEY" "$reason" \
        | md_frontmatter_set "$TICKET_DUPLICATE_OF_KEY" "$duplicate_of" \
        | fs_write "$closed_ticket_path"
    then
        log_error "Failed to write closed ticket: \"$closed_ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! rm -f "$ticket_path"; then
        rm -f "$closed_ticket_path"
        log_error "Failed to remove source ticket: \"$ticket_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "$closed_ticket_path"
}
