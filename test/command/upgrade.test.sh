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

UPGRADE_SCRIPT="$ROOT_DIR/lib/command/upgrade.sh"

run_upgrade_status() {
    if sh "$UPGRADE_SCRIPT" "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

help_test() {
    if output=$(sh "$UPGRADE_SCRIPT" --help 2>&1); then
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

help_value_test() {
    run_upgrade_status --help=true
}

help_with_other_option_test() {
    run_upgrade_status --help --dev
}

missing_version_test() {
    run_upgrade_status --version
}

empty_version_test() {
    run_upgrade_status --version=
}

multiple_options_test() {
    run_upgrade_status --version 1.0.0 --dev
}

dev_value_test() {
    run_upgrade_status --dev=true
}

unknown_option_test() {
    run_upgrade_status --unknown
}

unexpected_argument_test() {
    run_upgrade_status 1.0.0
}

run_test "show help message" "status=0 usage=yes" help_test
run_test "fail when help has a value" "1" help_value_test
run_test "fail when help is combined with another option" "1" help_with_other_option_test
run_test "fail when version value is missing" "1" missing_version_test
run_test "fail when version value is empty" "1" empty_version_test
run_test "fail when multiple options are specified" "1" multiple_options_test
run_test "fail when dev has a value" "1" dev_value_test
run_test "fail on unknown option" "1" unknown_option_test
run_test "fail on unexpected argument" "1" unexpected_argument_test

test_exit
