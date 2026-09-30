#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_uninstall()
{
    CODEX_HOME="$test_dir/codex" \
    CLAUDE_HOME="$test_dir/claude" \
    COPILOT_HOME="$test_dir/copilot" \
    GEMINI_HOME="$test_dir/gemini" \
    "$PROJECT_ROOT/bin/cr" uninstall "$@"
}

_install_codex()
{
    CODEX_HOME="$test_dir/codex" \
    CLAUDE_HOME="$test_dir/claude" \
    COPILOT_HOME="$test_dir/copilot" \
    GEMINI_HOME="$test_dir/gemini" \
    "$PROJECT_ROOT/bin/cr" install codex
}

_expect_usage()
{
    if _uninstall "$@" >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    else
        test_status=$?
    fi
    [ "$test_status" -eq 2 ] && grep -Fq 'Usage:' "$test_dir/err"
}

_absent_manifest_is_successful_noop()
{
    printf personal > "$test_dir/codex/AGENTS.md" || return 1
    _uninstall codex >"$test_dir/out" || return 1
    grep -Fq 'No managed installation found for codex.' "$test_dir/out" && \
        [ "$(cat "$test_dir/codex/AGENTS.md")" = personal ]
}

_uninstall_owned_files()
{
    _install_codex || return 1
    [ -f "$test_dir/codex/.coderail/harnesses/codex.manifest" ] || return 1
    _uninstall codex || return 1
    [ ! -e "$test_dir/codex/AGENTS.md" ] && \
        [ ! -e "$test_dir/codex/.coderail/harnesses/codex.manifest" ]
}

_edited_file_is_released()
{
    _install_codex || return 1
    printf personal > "$test_dir/codex/AGENTS.md" || return 1
    _uninstall --yes codex || return 1
    [ "$(cat "$test_dir/codex/AGENTS.md")" = personal ] && \
        [ ! -e "$test_dir/codex/.coderail/harnesses/codex.manifest" ]
}

_invalid_manifest_fails_without_mutation()
{
    rm -f "$test_dir/codex/AGENTS.md"
    _install_codex || return 1
    printf invalid > "$test_dir/codex/.coderail/harnesses/codex.manifest" || return 1
    if _uninstall codex >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    fi
    [ -f "$test_dir/codex/AGENTS.md" ] && \
        [ "$(cat "$test_dir/codex/.coderail/harnesses/codex.manifest")" = invalid ]
}

mkdir "$test_dir/codex" "$test_dir/claude" "$test_dir/copilot" "$test_dir/gemini"

print_tests_header "Uninstall Command Tests"

test "uninstall: requires a harness" _expect_usage
test "uninstall: rejects unknown harness" _expect_usage unknown
test "uninstall: keeps self removal reserved" _expect_usage --self
test "uninstall: accepts help" _uninstall --help
test "uninstall: missing manifest succeeds without changes" _absent_manifest_is_successful_noop
rm -f "$test_dir/codex/AGENTS.md"
test "uninstall: removes owned files without renderer input" _uninstall_owned_files
test "uninstall: yes alone preserves edited files" _edited_file_is_released
test "uninstall: invalid manifest fails without mutation" _invalid_manifest_fails_without_mutation

print_tests_summary

if some_tests_failed; then
    exit 1
fi
