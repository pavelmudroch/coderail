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

INSTALL_SCRIPT="$ROOT_DIR/lib/command/install.sh"

run_install_status() {
    if sh "$INSTALL_SCRIPT" "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

help_test() {
    if output=$(sh "$INSTALL_SCRIPT" --help 2>&1); then
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
    run_install_status codex
}

copilot_test() {
    run_install_status copilot
}

claude_test() {
    run_install_status claude
}

force_before_tool_test() {
    run_install_status --force codex
}

force_after_tool_test() {
    run_install_status codex --force
}

no_args_test() {
    run_install_status
}

help_value_test() {
    run_install_status --help=true
}

help_with_force_test() {
    run_install_status --help --force
}

tool_with_help_test() {
    run_install_status codex --help
}

force_value_test() {
    run_install_status --force=true codex
}

force_repeated_test() {
    run_install_status --force --force codex
}

unknown_option_test() {
    run_install_status --unknown codex
}

unsupported_tool_test() {
    run_install_status cursor
}

multiple_tools_test() {
    run_install_status codex claude
}

run_test "allow codex tool" "0" codex_test
run_test "allow copilot tool" "0" copilot_test
run_test "allow claude tool" "0" claude_test
run_test "allow force before tool" "0" force_before_tool_test
run_test "allow force after tool" "0" force_after_tool_test
run_test "show help message" "status=0 usage=yes" help_test
run_test "fail when tool is missing" "1" no_args_test
run_test "fail when help has a value" "1" help_value_test
run_test "fail when help is combined with force" "1" help_with_force_test
run_test "fail when help follows tool" "1" tool_with_help_test
run_test "fail when force has a value" "1" force_value_test
run_test "fail when force is repeated" "1" force_repeated_test
run_test "fail on unknown option" "1" unknown_option_test
run_test "fail on unsupported tool" "1" unsupported_tool_test
run_test "fail on multiple tools" "1" multiple_tools_test

test_exit
