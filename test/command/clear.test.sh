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

CLEAR_SCRIPT="$ROOT_DIR/lib/command/clear.sh"

run_clear_status() {
    if sh "$CLEAR_SCRIPT" "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

help_test() {
    if output=$(sh "$CLEAR_SCRIPT" --help 2>&1); then
        status=0
    else
        status=$?
    fi

    case "$output" in
        *"Usage:"*"--help"*"--force"*"codex"*"copilot"*"claude"*) usage=yes ;;
        *) usage=no ;;
    esac

    printf 'status=%s usage=%s' "$status" "$usage"
}

codex_test() {
    run_clear_status codex
}

copilot_test() {
    run_clear_status copilot
}

claude_test() {
    run_clear_status claude
}

force_before_target_test() {
    run_clear_status --force codex
}

force_after_target_test() {
    run_clear_status codex --force
}

no_args_test() {
    run_clear_status
}

help_value_test() {
    run_clear_status --help=true
}

help_with_force_test() {
    run_clear_status --help --force
}

target_with_help_test() {
    run_clear_status codex --help
}

force_value_test() {
    run_clear_status --force=true codex
}

force_repeated_test() {
    run_clear_status --force --force codex
}

unknown_option_test() {
    run_clear_status --unknown codex
}

unsupported_target_test() {
    run_clear_status cursor
}

multiple_targets_test() {
    run_clear_status codex claude
}

run_test "allow codex target" "0" codex_test
run_test "allow copilot target" "0" copilot_test
run_test "allow claude target" "0" claude_test
run_test "allow force before target" "0" force_before_target_test
run_test "allow force after target" "0" force_after_target_test
run_test "show help message" "status=0 usage=yes" help_test
run_test "fail when target is missing" "1" no_args_test
run_test "fail when help has a value" "1" help_value_test
run_test "fail when help is combined with force" "1" help_with_force_test
run_test "fail when help follows target" "1" target_with_help_test
run_test "fail when force has a value" "1" force_value_test
run_test "fail when force is repeated" "1" force_repeated_test
run_test "fail on unknown option" "1" unknown_option_test
run_test "fail on unsupported target" "1" unsupported_target_test
run_test "fail on multiple targets" "1" multiple_targets_test

test_exit
