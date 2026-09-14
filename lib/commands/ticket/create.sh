#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr ticket create [options] <ticket-title>

  Create a new ticket with specified title and optional dependencies.

Options:
  -h, --help           Show this help message and exit
  -d, --depends-on <ticket>
                       The ticket id, or ticket slug this new ticket depends on
                       Can be specified multiple times for multiple dependencies

Arguments:
  <ticket-title>       The title of the ticket to create
EOF
}

execute_command()
{
    depends_on_tickets=""
    ticket_title=""
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
                if [ -n "$ticket_title" ]; then
                    log_error "Multiple ticket titles provided"
                    usage >&2
                    exit "$_CR_USAGE_EXIT_CODE"
                fi
                ticket_title="$1"
                ;;
        esac
        shift
    done

    if [ -z "$ticket_title" ]; then
        if [ $# -eq 0 ]; then
            log_error "Required ticket title argument is missing"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi
        if [ $# -gt 1 ]; then
            log_error "Multiple ticket titles provided"
            usage >&2
            exit "$_CR_USAGE_EXIT_CODE"
        fi
        ticket_title="$1"
        shift
    fi

    if [ $# -gt 0 ]; then
        log_error "Multiple ticket titles provided"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    ticket_slug="$(slugify "$ticket_title")"
    if [ -z "$ticket_slug" ]; then
        log_error "Ticket title must contain letters or numbers"
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    set --
    while IFS= read -r dependency; do
        [ -n "$dependency" ] || continue
        if ! dependency_path="$(_resolve_ticket_path "$dependency" 2>&1)"; then
            log_error "Failed to resolve dependency \"$dependency\": $dependency_path"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
        dependency_slug="${dependency_path##*/}"
        set -- "$@" "${dependency_slug%%-*}"
    done <<EOF
$depends_on_tickets
EOF
    depends_on="$(_merge_ticket_dependencies "$@")"

    ticket_id="$(_next_ticket_id)"
    ticket_file="$TICKETS_PATH/open/$ticket_id-$ticket_slug.md"
    if [ -e "$ticket_file" ] || [ -L "$ticket_file" ]; then
        log_error "Ticket already exists at path: \"$ticket_file\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! fs_make_dir "$TICKETS_PATH/open"; then
        log_error "Cannot write to \"$TICKETS_PATH/open\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! md_frontmatter_empty \
        | md_frontmatter_set "$TICKET_TITLE_KEY" "$ticket_title" \
        | md_frontmatter_set "$TICKET_STATUS_KEY" "$TICKET_STATUS_OPEN" \
        | md_frontmatter_set "$TICKET_DEPENDS_ON_KEY" "$depends_on" \
        | fs_write "$ticket_file"
    then
        log_error "Failed to create ticket file: \"$ticket_file\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "$ticket_file"
}

_next_ticket_id()
{
    for ticket_path in "$TICKETS_PATH"/open/*.md \
        "$TICKETS_PATH"/active/*.md \
        "$TICKETS_PATH"/close/*.md
    do
        [ -f "$ticket_path" ] || continue
        ticket_name="${ticket_path##*/}"
        printf '%s\n' "${ticket_name%%-*}"
    done | awk '
        /^[0-9]+$/ && $0 + 0 > maximum { maximum = $0 + 0 }
        END { printf "%04d\n", maximum + 1 }
    '
}
