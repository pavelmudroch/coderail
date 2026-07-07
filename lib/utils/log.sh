#!/usr/bin/env sh

if [ ! "${log_verbose+x}" ]; then
    log_verbose=false
fi

if [ ! "${log_quiet+x}" ]; then
    log_quiet=false
fi

log_notice() {
    if [ "$log_quiet" = true ] || [ "$log_verbose" = false ]; then
        return
    fi
    message=$1
    echo "\033[90m > $message\033[0m"
}

log_info() {
    if [ "$log_quiet" = true ]; then
        return
    fi
    message=$1
    echo "$message"
}

log_error() {
    if [ "$log_quiet" = true ]; then
        return
    fi
    message=$1
    echo "error: $message" >&2
}

log_usage_error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}
