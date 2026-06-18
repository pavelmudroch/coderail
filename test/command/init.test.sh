#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)
ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$SCRIPT_DIR/../suite.sh"

INIT_SCRIPT="$ROOT_DIR/lib/command/init.sh"

run_init_status() {
    if sh "$INIT_SCRIPT" "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

help_test() {
    if output=$(sh "$INIT_SCRIPT" --help 2>&1); then
        status=0
    else
        status=$?
    fi

    case "$output" in
        *"Usage:"*"--help"*) usage=yes ;;
        *) usage=no ;;
    esac

    printf 'status=%s usage=%s' "$status" "$usage"
}

no_args_test() {
    run_init_status
}

help_value_test() {
    run_init_status --help=true
}

help_with_argument_test() {
    run_init_status --help project
}

short_help_test() {
    run_init_status -h
}

unknown_option_test() {
    run_init_status --unknown
}

unexpected_argument_test() {
    run_init_status project
}

run_test "allow no init arguments" "0" no_args_test
run_test "show help message" "status=0 usage=yes" help_test
run_test "fail when help has a value" "1" help_value_test
run_test "fail when help is combined with an argument" "1" help_with_argument_test
run_test "fail on short help option" "1" short_help_test
run_test "fail on unknown option" "1" unknown_option_test
run_test "fail on unexpected argument" "1" unexpected_argument_test

test_exit
