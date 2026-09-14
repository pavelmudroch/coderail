#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr ticket next [options]

  List next available open tickets with satisfied dependencies

Options:
  -h, --help           Show this help message and exit
  -l, --limit <number>
                       Only list the specified number of tickets (default: all)
EOF
}

execute_command()
{
    limit=""

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
            -l|--limit)
                shift
                if [ -z "${1-}" ]; then
                    log_error "Missing argument for --limit option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                limit="$1"
                ;;
            --limit=*)
                value="${1#*=}"
                if [ -z "$value" ]; then
                    log_error "Missing argument for --limit option"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                limit="$value"
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
                log_error "Unknown argument: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    if [ $# -ne 0 ]; then
        log_error "Unexpected positional arguments: $*"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if [ -n "$limit" ]; then
        case "$limit" in
            ''|0*|*[!0-9]*)
                log_error "Limit must be a positive integer"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
    fi

    count=0
    for ticket_path in "$TICKETS_PATH"/open/*.md; do
        [ -f "$ticket_path" ] || continue
        ticket_content=$(_read_ticket_file "$ticket_path" 2>/dev/null) || continue
        status=$(printf '%s\n' "$ticket_content" | md_frontmatter_get "$TICKET_STATUS_KEY") || continue
        [ "$status" = "$TICKET_STATUS_OPEN" ] || continue
        _ticket_dependencies_satisfied "$ticket_path" || continue

        output "$ticket_path"
        count=$((count + 1))
        if [ -n "$limit" ] && [ "$count" = "$limit" ]; then
            break
        fi
    done

    return "$_CR_SUCCESS_EXIT_CODE"
}
