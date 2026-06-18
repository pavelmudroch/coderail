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
    tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-command-install-test.XXXXXX")
    if (cd "$tmp_dir" && sh "$INSTALL_SCRIPT" "$@" >/dev/null 2>&1); then
        status=0
    else
        status=$?
    fi
    rm -rf "$tmp_dir"
    printf '%s' "$status"
}

file_exists() {
    if [ -e "$1" ]; then
        printf yes
    else
        printf no
    fi
}

contains() {
    if awk -v pattern="$2" 'index($0, pattern) { found = 1 } END { exit !found }' "$1"; then
        printf yes
    else
        printf no
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

install_outputs_test() {
    tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-command-install-test.XXXXXX")
    (
        cd "$tmp_dir"
        sh "$INSTALL_SCRIPT" codex copilot claude >/dev/null 2>&1
    )

    printf 'codex=%s copilot=%s claude=%s skill=%s codex_agent=%s codex_tag=%s copilot_tag=%s claude_tag=%s yaml=%s' \
        "$(file_exists "$tmp_dir/AGENTS.md")" \
        "$(file_exists "$tmp_dir/.github/copilot-instructions.md")" \
        "$(file_exists "$tmp_dir/CLAUDE.md")" \
        "$(file_exists "$tmp_dir/.codex/skills/grill-me/SKILL.md")" \
        "$(file_exists "$tmp_dir/.codex/agents/worker.yaml")" \
        "$(contains "$tmp_dir/.codex/skills/grill-me/SKILL.md" '$research-codebase')" \
        "$(contains "$tmp_dir/.github/instructions/skills/grill-me/SKILL.md" '/research-codebase')" \
        "$(contains "$tmp_dir/.claude/skills/grill-me/SKILL.md" '/research-codebase')" \
        "$(contains "$tmp_dir/.codex/agents/worker.yaml" 'instructions: |-')"

    rm -rf "$tmp_dir"
}

force_required_test() {
    tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-command-install-test.XXXXXX")
    (
        cd "$tmp_dir"
        sh "$INSTALL_SCRIPT" codex >/dev/null 2>&1
    )
    if (
        cd "$tmp_dir"
        sh "$INSTALL_SCRIPT" codex >/dev/null 2>&1
    ); then
        status=0
    else
        status=$?
    fi
    rm -rf "$tmp_dir"
    printf '%s' "$status"
}

force_overrides_test() {
    tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/coderail-command-install-test.XXXXXX")
    (
        cd "$tmp_dir"
        sh "$INSTALL_SCRIPT" codex >/dev/null 2>&1
        sh "$INSTALL_SCRIPT" --force codex >/dev/null 2>&1
    )
    status=$?
    rm -rf "$tmp_dir"
    printf '%s' "$status"
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
run_test "allow multiple tools" "0" multiple_tools_test
run_test "install translated instruction files" "codex=yes copilot=yes claude=yes skill=yes codex_agent=yes codex_tag=yes copilot_tag=yes claude_tag=yes yaml=yes" install_outputs_test
run_test "fail before overriding existing files" "1" force_required_test
run_test "allow force overriding existing files" "0" force_overrides_test

test_exit
