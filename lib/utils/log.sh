#!/usr/bin/env sh

: "${log_verbose:=0}"
: "${log_quiet:=0}"

log_notice() {
    if [ "$log_quiet" = 1 ] || [ "$log_verbose" = 0 ]; then
        return
    fi
    message=$1
    echo "\033[90m > $message\033[0m"
}

log_info() {
    if [ "$log_quiet" = 1 ]; then
        return
    fi
    message=$1
    echo "$message"
}

log_error() {
    message=$1
    echo "error: $message" >&2
}

log_usage_error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}
