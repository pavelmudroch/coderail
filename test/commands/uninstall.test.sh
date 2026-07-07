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
PROJECT_ROOT=$ROOT_DIR

CR=$ROOT_DIR/bin/cr
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-uninstall-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"
ROOT_DIR=$PROJECT_ROOT

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_dir() {
    [ -d "$1" ] || fail "missing directory: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

tool_dir_name() {
    case "$1" in
        codex) printf '.codex\n' ;;
        copilot) printf '.copilot\n' ;;
        claude) printf '.claude\n' ;;
        gemini) printf '.gemini\n' ;;
        *) fail "unknown tool: $1" ;;
    esac
}

root_instruction_file_name() {
    case "$1" in
        codex) printf 'AGENTS.md\n' ;;
        copilot) printf 'copilot-instructions.md\n' ;;
        claude) printf 'CLAUDE.md\n' ;;
        gemini) printf 'GEMINI.md\n' ;;
        *) fail "unknown tool: $1" ;;
    esac
}

home_dir_for_case_tool() {
    case_name=$1
    tool=$2

    printf '%s/home-%s-%s\n' "$tmp_dir" "$case_name" "$tool"
}

tool_dir_for_home_tool() {
    home_dir=$1
    tool=$2

    printf '%s/%s\n' "$home_dir" "$(tool_dir_name "$tool")"
}

root_file_for_tool_dir() {
    tool_dir=$1
    tool=$2

    printf '%s/%s\n' "$tool_dir" "$(root_instruction_file_name "$tool")"
}

managed_file_for_tool_dir() {
    tool_dir=$1

    printf '%s/skills/ticket-pick/SKILL.md\n' "$tool_dir"
}

agent_file_for_tool_dir() {
    tool_dir=$1
    tool=$2

    case "$tool" in
        codex) printf '%s/agents/worker.toml\n' "$tool_dir" ;;
        copilot) printf '%s/agents/worker.agent.md\n' "$tool_dir" ;;
        claude) printf '%s/agents/worker.md\n' "$tool_dir" ;;
        gemini) printf '%s/agents\n' "$tool_dir" ;;
        *) fail "unknown tool: $tool" ;;
    esac
}

assert_install_succeeds() {
    home_dir=$1
    shift

    HOME=$home_dir "$CR" install "$@" >/dev/null
}

assert_uninstall_succeeds() {
    home_dir=$1
    shift

    HOME=$home_dir "$CR" uninstall "$@" >/dev/null
}

assert_uninstall_fails() {
    home_dir=$1
    shift

    set +e
    HOME=$home_dir "$CR" uninstall "$@" >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "uninstall unexpectedly succeeded: cr uninstall $*"
}

assert_tool_installed() {
    home_dir=$1
    tool=$2
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    agent_file=$(agent_file_for_tool_dir "$tool_dir" "$tool")

    assert_file "$(root_file_for_tool_dir "$tool_dir" "$tool")"
    assert_file "$(managed_file_for_tool_dir "$tool_dir")"
    assert_file "$tool_dir/.coderail-install"

    if [ "$tool" != gemini ]; then
        assert_file "$agent_file"
    fi
}

assert_tool_uninstalled() {
    home_dir=$1
    tool=$2
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    agent_file=$(agent_file_for_tool_dir "$tool_dir" "$tool")

    assert_path_missing "$(root_file_for_tool_dir "$tool_dir" "$tool")"
    assert_path_missing "$(managed_file_for_tool_dir "$tool_dir")"
    assert_path_missing "$tool_dir/.coderail-install"

    if [ "$tool" != gemini ]; then
        assert_path_missing "$agent_file"
    fi

    assert_path_missing "$tool_dir"
}

modify_managed_file() {
    tool=$1
    tool_dir=$2
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    printf 'modified managed file for %s\n' "$tool" > "$managed_file"
}

assert_uninstall_unknown_tool_fails() {
    home_dir=$tmp_dir/home-unknown-tool

    mkdir "$home_dir"

    assert_uninstall_fails "$home_dir" unknown
    assert_path_missing "$home_dir/.codex"
    assert_path_missing "$home_dir/.copilot"
    assert_path_missing "$home_dir/.claude"
    assert_path_missing "$home_dir/.gemini"
}

assert_clean_uninstall() {
    tool=$1
    home_dir=$(home_dir_for_case_tool clean "$tool")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    assert_tool_installed "$home_dir" "$tool"

    assert_uninstall_succeeds "$home_dir" "$tool"

    assert_tool_uninstalled "$home_dir" "$tool"
}

assert_modified_managed_file_is_refused() {
    tool=$1
    home_dir=$(home_dir_for_case_tool modified "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    modify_managed_file "$tool" "$tool_dir"

    assert_uninstall_fails "$home_dir" "$tool"

    assert_contains "$managed_file" "modified managed file for $tool"
    assert_file "$tool_dir/.coderail-install"
    assert_file "$(root_file_for_tool_dir "$tool_dir" "$tool")"
}

assert_force_removes_modified_managed_file() {
    tool=$1
    home_dir=$(home_dir_for_case_tool force-modified "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    modify_managed_file "$tool" "$tool_dir"

    assert_uninstall_succeeds "$home_dir" --force "$tool"

    assert_path_missing "$managed_file"
    assert_tool_uninstalled "$home_dir" "$tool"
}

assert_missing_managed_file_does_not_block_uninstall() {
    tool=$1
    home_dir=$(home_dir_for_case_tool missing "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    rm -f "$managed_file"

    assert_uninstall_succeeds "$home_dir" "$tool"

    assert_tool_uninstalled "$home_dir" "$tool"
}

assert_untracked_file_without_manifest_is_preserved() {
    tool=$1
    home_dir=$(home_dir_for_case_tool untracked "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    user_file=$tool_dir/user-not-managed.md

    mkdir "$home_dir"
    mkdir "$tool_dir"
    printf 'user-owned file for %s\n' "$tool" > "$user_file"

    assert_uninstall_succeeds "$home_dir" "$tool"

    assert_file "$user_file"
    assert_contains "$user_file" "user-owned file for $tool"
    assert_path_missing "$tool_dir/.coderail-install"
}

assert_untracked_file_in_managed_dir_is_preserved() {
    tool=$1
    home_dir=$(home_dir_for_case_tool untracked-managed-dir "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    user_file=$tool_dir/skills/user-not-managed.md

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    printf 'user-owned file for %s\n' "$tool" > "$user_file"

    assert_uninstall_succeeds "$home_dir" "$tool"

    assert_dir "$tool_dir"
    assert_dir "$tool_dir/skills"
    assert_file "$user_file"
    assert_contains "$user_file" "user-owned file for $tool"
    assert_path_missing "$tool_dir/.coderail-install"
    assert_path_missing "$(managed_file_for_tool_dir "$tool_dir")"
}

assert_multi_tool_uninstall() {
    home_dir=$tmp_dir/home-multiple-tools

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" codex copilot claude gemini

    assert_uninstall_succeeds "$home_dir" codex copilot claude gemini

    assert_tool_uninstalled "$home_dir" codex
    assert_tool_uninstalled "$home_dir" copilot
    assert_tool_uninstalled "$home_dir" claude
    assert_tool_uninstalled "$home_dir" gemini
}

assert_uninstall_preserves_unselected_tool() {
    home_dir=$tmp_dir/home-selected-tool

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" codex copilot

    assert_uninstall_succeeds "$home_dir" codex

    assert_tool_uninstalled "$home_dir" codex
    assert_tool_installed "$home_dir" copilot
}

assert_tool_home_override() {
    tool=$1
    home_dir=$(home_dir_for_case_tool override "$tool")
    override_dir=$tmp_dir/override-$tool
    default_tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")

    mkdir "$home_dir"

    case "$tool" in
        codex) HOME=$home_dir CODERAIL_CODEX_HOME=$override_dir "$CR" install "$tool" >/dev/null ;;
        copilot) HOME=$home_dir CODERAIL_COPILOT_HOME=$override_dir "$CR" install "$tool" >/dev/null ;;
        claude) HOME=$home_dir CODERAIL_CLAUDE_HOME=$override_dir "$CR" install "$tool" >/dev/null ;;
        gemini) HOME=$home_dir CODERAIL_GEMINI_HOME=$override_dir "$CR" install "$tool" >/dev/null ;;
        *) fail "unknown tool: $tool" ;;
    esac

    assert_file "$override_dir/.coderail-install"

    case "$tool" in
        codex) HOME=$home_dir CODERAIL_CODEX_HOME=$override_dir "$CR" uninstall "$tool" >/dev/null ;;
        copilot) HOME=$home_dir CODERAIL_COPILOT_HOME=$override_dir "$CR" uninstall "$tool" >/dev/null ;;
        claude) HOME=$home_dir CODERAIL_CLAUDE_HOME=$override_dir "$CR" uninstall "$tool" >/dev/null ;;
        gemini) HOME=$home_dir CODERAIL_GEMINI_HOME=$override_dir "$CR" uninstall "$tool" >/dev/null ;;
        *) fail "unknown tool: $tool" ;;
    esac

    assert_path_missing "$override_dir/.coderail-install"
    assert_path_missing "$default_tool_dir"
}

print_tests_header "Uninstallation Tests"
test "Uninstall unknown tool fails" assert_uninstall_unknown_tool_fails
test "Uninstall multiple tools" assert_multi_tool_uninstall
test "Uninstall preserves unselected tool" assert_uninstall_preserves_unselected_tool

for tool in codex copilot claude gemini; do
    test "Clean uninstall for $tool tool" assert_clean_uninstall "$tool"
    test "Target home override for $tool tool" assert_tool_home_override "$tool"
    test "Modified managed file refused for $tool tool" assert_modified_managed_file_is_refused "$tool"
    test "Force removes modified managed file for $tool tool" assert_force_removes_modified_managed_file "$tool"
    test "Missing managed file does not block uninstall for $tool tool" assert_missing_managed_file_does_not_block_uninstall "$tool"
    test "Uninstall preserves untracked files without manifest for $tool tool" assert_untracked_file_without_manifest_is_preserved "$tool"
    test "Uninstall preserves untracked files in managed dirs for $tool tool" assert_untracked_file_in_managed_dir_is_preserved "$tool"
done

print_tests_summary

if some_tests_failed; then
    exit 1
fi
