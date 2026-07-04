#!/usr/bin/env sh

log_verbose=false
log_quiet=false

log_notice() {
    if [ "$log_quiet" = true ] || [ "$log_verbose" = false ]; then
        return
    fi
    message=$1
    echo " > $message"
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
