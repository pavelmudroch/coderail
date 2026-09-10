#!/usr/bin/env sh

usage() {
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
}