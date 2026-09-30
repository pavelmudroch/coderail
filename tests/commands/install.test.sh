#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_install()
{
    CODEX_HOME="$test_dir/codex" \
    CLAUDE_HOME="$test_dir/claude" \
    COPILOT_HOME="$test_dir/copilot" \
    GEMINI_HOME="$test_dir/gemini" \
    "$PROJECT_ROOT/bin/cr" install "$@"
}

_expect_usage()
{
    if _install "$@" >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    else
        test_status=$?
    fi
    [ "$test_status" -eq 2 ] && grep -Fq 'Usage:' "$test_dir/err"
}

_install_all_layouts()
{
    _install codex claude copilot gemini || return 1
    [ -f "$test_dir/codex/AGENTS.md" ] || return 1
    [ -f "$test_dir/claude/CLAUDE.md" ] || return 1
    [ -f "$test_dir/copilot/copilot-instructions.md" ] || return 1
    [ -f "$test_dir/gemini/GEMINI.md" ] || return 1
    [ -f "$test_dir/codex/.coderail/harnesses/codex.manifest" ] || return 1
    [ -f "$test_dir/claude/.coderail/harnesses/claude.manifest" ] || return 1
    [ -f "$test_dir/copilot/.coderail/harnesses/copilot.manifest" ] || return 1
    [ -f "$test_dir/gemini/.coderail/harnesses/gemini.manifest" ]
}

_default_home_is_created()
{
    test_home=$test_dir/default-home
    mkdir "$test_home" || return 1
    HOME="$test_home" "$PROJECT_ROOT/bin/cr" install codex || return 1
    [ -f "$test_home/.codex/AGENTS.md" ] && \
        [ -f "$test_home/.codex/.coderail/harnesses/codex.manifest" ]
}

_unsafe_home_is_rejected()
{
    ln -s "$test_dir/codex" "$test_dir/linked-home"
    if CODEX_HOME="$test_dir/linked-home" \
        CLAUDE_HOME="$test_dir/claude" COPILOT_HOME="$test_dir/copilot" \
        GEMINI_HOME="$test_dir/gemini" "$PROJECT_ROOT/bin/cr" install codex \
        >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    fi
    [ ! -e "$test_dir/codex/.coderail/harnesses/codex.manifest" ]
}

_unmanaged_collision_leaves_home_unchanged()
{
    printf 'personal\n' > "$test_dir/codex/AGENTS.md"
    before=$(cksum "$test_dir/codex/AGENTS.md")
    if _install --force --yes codex >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    fi
    [ "$(cksum "$test_dir/codex/AGENTS.md")" = "$before" ] && \
        [ ! -e "$test_dir/codex/.coderail/harnesses/codex.manifest" ]
}

_shared_and_nested_homes_are_preflighted()
{
    mkdir "$test_dir/shared" "$test_dir/shared/nested" || return 1
    if CODEX_HOME="$test_dir/shared" CLAUDE_HOME="$test_dir/shared" \
        COPILOT_HOME="$test_dir/copilot" GEMINI_HOME="$test_dir/gemini" \
        "$PROJECT_ROOT/bin/cr" install codex claude >"$test_dir/out" 2>"$test_dir/err"; then
        return 1
    fi
    [ ! -e "$test_dir/shared/AGENTS.md" ] && [ ! -e "$test_dir/shared/CLAUDE.md" ] || return 1
    CODEX_HOME="$test_dir/shared" CLAUDE_HOME="$test_dir/claude" \
    COPILOT_HOME="$test_dir/shared/nested" GEMINI_HOME="$test_dir/gemini" \
    "$PROJECT_ROOT/bin/cr" install codex copilot || return 1
    [ -f "$test_dir/shared/AGENTS.md" ] && \
        [ -f "$test_dir/shared/nested/copilot-instructions.md" ] && \
        [ -f "$test_dir/shared/.coderail/harnesses/codex.manifest" ]
}

mkdir "$test_dir/codex" "$test_dir/claude" "$test_dir/copilot" "$test_dir/gemini"

print_tests_header "Install Command Tests"

test "install: requires a harness" _expect_usage
test "install: rejects unknown harness" _expect_usage unknown
test "install: accepts help" _install --help
test "install: creates a missing default home during application" _default_home_is_created
test "install: creates all rendered layouts and manifests" _install_all_layouts

rm -rf "$test_dir/codex" "$test_dir/claude" "$test_dir/copilot" "$test_dir/gemini"
mkdir "$test_dir/codex" "$test_dir/claude" "$test_dir/copilot" "$test_dir/gemini"
test "install: unmanaged identical collision is rejected" _unmanaged_collision_leaves_home_unchanged
test "install: rejects a linked configured home" _unsafe_home_is_rejected
test "install: rejects equal claims and permits nested homes" _shared_and_nested_homes_are_preflighted

print_tests_summary

if some_tests_failed; then
    exit 1
fi
