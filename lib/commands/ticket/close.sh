#!/usr/bin/env sh

usage() {
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
}