#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr ticket activate [options] <ticket>

  Activate an existing ticket by its ID or slug.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <ticket>             The ID or slug of the ticket to activate
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
}