#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket reopen [options] <ticket>

  Reopen an existing ticket by its ID or slug.

Options:
  -h, --help           Show this help message and exit
  -d, --depends-on <ticket>
                       The ticket id, or ticket slug this ticket depends on
                       Can be specified multiple times for multiple dependencies
                       Serves as additional dependencies for the ticket being
                       reopened, does not replace existing dependencies

Arguments:
  <ticket>             The ID or slug of the ticket to reopen
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
            -d|--depends-on=*)
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
}