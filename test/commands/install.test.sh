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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-install-test.XXXXXX")

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

assert_dir() {
    [ -d "$1" ] || fail "missing directory: $1"
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {
    if grep -F "$2" "$1" >/dev/null; then
        fail "$1 contains: $2"
    fi
}

assert_same_file() {
    cmp "$1" "$2" >/dev/null || fail "$2 differs from $1"
}

assert_translated_file() {
    source_file=$1
    target_file=$2
    tool=$3
    expected_file=$tmp_dir/expected-translated

    case "$tool" in
        codex)
            sed 's#<skill>\([^<]*\)</skill>#$\1#g' "$source_file" > "$expected_file"
            ;;
        copilot|claude|gemini)
            sed 's#<skill>\([^<]*\)</skill>#/\1#g' "$source_file" > "$expected_file"
            ;;
        *)
            fail "unknown tool: $tool"
            ;;
    esac

    assert_same_file "$expected_file" "$target_file"
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

agent_file_name() {
    case "$1" in
        codex) printf 'AGENTS.md\n' ;;
        copilot) printf 'copilot-instructions.md\n' ;;
        claude) printf 'CLAUDE.md\n' ;;
        gemini) printf 'GEMINI.md\n' ;;
        *) fail "unknown tool: $1" ;;
    esac
}

home_dir_for_tool() {
    printf '%s/home-%s\n' "$tmp_dir" "$1"
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

tool_dir_for_tool() {
    tool=$1
    tool_dir_for_home_tool "$(home_dir_for_tool "$tool")" "$tool"
}

skill_reference() {
    case "$1" in
        codex) printf '$ticket-implement\n' ;;
        copilot|claude|gemini) printf '/ticket-implement\n' ;;
        *) fail "unknown tool: $1" ;;
    esac
}

relative_path() {
    path=$1
    base=$2

    case "$path" in
        "$base"/*) printf '%s\n' "${path#"$base"/}" ;;
        *) fail "$path is not under $base" ;;
    esac
}

assert_marker_checksums() {
    tool_dir=$1
    marker_file=$tool_dir/.coderail-install
    expected_file=$tmp_dir/expected-marker
    actual_file=$tmp_dir/actual-marker

    assert_file "$marker_file"
    : > "$expected_file"

    find "$tool_dir" -type f ! -name '.coderail-install' | sort | while IFS= read -r installed_file; do
        rel_path=$(relative_path "$installed_file" "$tool_dir")
        (
            cd "$tool_dir"
            cksum "$rel_path"
        ) >> "$expected_file"
    done

    sort "$marker_file" > "$actual_file"
    sort "$expected_file" > "$expected_file.sorted"
    cmp "$expected_file.sorted" "$actual_file" >/dev/null ||
        fail "$marker_file does not match installed file checksums"
}

write_marker_checksums() {
    tool_dir=$1
    marker_file=$tool_dir/.coderail-install
    marker_tmp=$tmp_dir/marker

    : > "$marker_tmp"

    find "$tool_dir" -type f ! -name '.coderail-install' | sort | while IFS= read -r installed_file; do
        rel_path=$(relative_path "$installed_file" "$tool_dir")
        (
            cd "$tool_dir"
            cksum "$rel_path"
        ) >> "$marker_tmp"
    done

    mv "$marker_tmp" "$marker_file"
}

assert_copied_tree() {
    source_dir=$1
    target_dir=$2
    compare_content=$3

    find "$source_dir" -type f | sort | while IFS= read -r source_file; do
        rel_path=$(relative_path "$source_file" "$source_dir")
        target_file=$target_dir/$rel_path

        assert_file "$target_file"

        if [ "$compare_content" = true ]; then
            assert_same_file "$source_file" "$target_file"
        fi
    done
}

assert_translated_instructions() {
    instructions_dir=$1

    find "$instructions_dir" -type f | sort | while IFS= read -r instruction_file; do
        assert_not_contains "$instruction_file" '<skill>'
        assert_not_contains "$instruction_file" '</skill>'
    done
}

assert_install_succeeds() {
    home_dir=$1
    shift

    HOME=$home_dir "$CR" install "$@" >/dev/null
}

assert_install_fails() {
    home_dir=$1
    shift

    set +e
    HOME=$home_dir "$CR" install "$@" >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "install unexpectedly succeeded: cr install $*"
}

assert_installed_files_in_home() {
    home_dir=$1
    tool=$2
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    agent_file=$tool_dir/$(agent_file_name "$tool")
    skill_file=$tool_dir/instructions/skills/ticket-pick/SKILL.md

    assert_dir "$tool_dir"
    assert_dir "$tool_dir/bin"
    assert_dir "$tool_dir/instructions"
    assert_dir "$tool_dir/lib"

    assert_copied_tree "$ROOT_DIR/bin" "$tool_dir/bin" true
    assert_copied_tree "$ROOT_DIR/lib" "$tool_dir/lib" true
    assert_copied_tree "$ROOT_DIR/instructions" "$tool_dir/instructions" false

    assert_file "$tool_dir/bin/cr"
    assert_file "$tool_dir/lib/commands/install.sh"
    assert_file "$skill_file"
    assert_file "$agent_file"

    assert_translated_instructions "$tool_dir/instructions"
    assert_contains "$skill_file" "$(skill_reference "$tool")"

    assert_marker_checksums "$tool_dir"
}

assert_installed_files() {
    tool=$1

    assert_installed_files_in_home "$(home_dir_for_tool "$tool")" "$tool"
}

assert_clean_install() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")

    mkdir "$home_dir"

    assert_install_succeeds "$home_dir" "$tool"

    assert_installed_files "$tool"
}

modify_tracked_file() {
    file=$1
    tool=$2
    category=$3

    printf 'modified tracked %s file for %s\n' "$category" "$tool" > "$file"
}

modify_tracked_install_files() {
    tool=$1
    tool_dir=$(tool_dir_for_tool "$tool")

    assert_dir "$tool_dir"

    modify_install_files "$tool"
    write_marker_checksums "$tool_dir"
}

modify_install_files() {
    tool=$1
    tool_dir=$(tool_dir_for_tool "$tool")

    assert_dir "$tool_dir"

    modify_tracked_file "$tool_dir/$(agent_file_name "$tool")" "$tool" agent
    modify_tracked_file "$tool_dir/instructions/agents/worker.md" "$tool" agents
    modify_tracked_file "$tool_dir/instructions/skills/ticket-pick/SKILL.md" "$tool" skills
    modify_tracked_file "$tool_dir/lib/commands/install.sh" "$tool" lib
}

assert_reinstalled_modified_files() {
    tool=$1
    tool_dir=$(tool_dir_for_tool "$tool")
    agent_file=$tool_dir/$(agent_file_name "$tool")
    agent_dir_file=$tool_dir/instructions/agents/worker.md
    skill_file=$tool_dir/instructions/skills/ticket-pick/SKILL.md
    lib_file=$tool_dir/lib/commands/install.sh

    assert_translated_file "$ROOT_DIR/instructions/AGENTS.md" "$agent_file" "$tool"
    assert_translated_file "$ROOT_DIR/instructions/agents/worker.md" "$agent_dir_file" "$tool"
    assert_translated_file "$ROOT_DIR/instructions/skills/ticket-pick/SKILL.md" "$skill_file" "$tool"
    assert_same_file "$ROOT_DIR/lib/commands/install.sh" "$lib_file"

    assert_not_contains "$agent_file" "modified tracked"
    assert_not_contains "$agent_dir_file" "modified tracked"
    assert_not_contains "$skill_file" "modified tracked"
    assert_not_contains "$lib_file" "modified tracked"
    assert_marker_checksums "$tool_dir"
}

assert_reinstall_overwrites_tracked_files() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")

    modify_tracked_install_files "$tool"

    assert_install_succeeds "$home_dir" "$tool"

    assert_reinstalled_modified_files "$tool"
}

assert_modified_file_preserved() {
    file=$1
    tool=$2
    category=$3

    assert_contains "$file" "modified tracked $category file for $tool"
}

assert_modified_files_preserved() {
    tool=$1
    tool_dir=$(tool_dir_for_tool "$tool")

    assert_modified_file_preserved "$tool_dir/$(agent_file_name "$tool")" "$tool" agent
    assert_modified_file_preserved "$tool_dir/instructions/agents/worker.md" "$tool" agents
    assert_modified_file_preserved "$tool_dir/instructions/skills/ticket-pick/SKILL.md" "$tool" skills
    assert_modified_file_preserved "$tool_dir/lib/commands/install.sh" "$tool" lib
}

assert_reinstall_keeps_modified_files() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")

    modify_install_files "$tool"

    set +e
    HOME=$home_dir "$CR" install "$tool" >/dev/null 2>&1
    set -e

    assert_modified_files_preserved "$tool"
}

assert_force_reinstall_overwrites_modified_files() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")

    modify_install_files "$tool"

    assert_install_succeeds "$home_dir" --force "$tool"

    assert_reinstalled_modified_files "$tool"
}

assert_reinstall_restores_missing_tracked_file() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")
    tool_dir=$(tool_dir_for_tool "$tool")
    missing_file=$tool_dir/instructions/agents/worker.md

    rm -f "$missing_file"
    assert_path_missing "$missing_file"

    assert_install_succeeds "$home_dir" "$tool"

    assert_translated_file "$ROOT_DIR/instructions/agents/worker.md" "$missing_file" "$tool"
    assert_marker_checksums "$tool_dir"
}

assert_reinstall_removes_stale_tracked_file() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")
    tool_dir=$(tool_dir_for_tool "$tool")
    stale_file=$tool_dir/lib/commands/no-longer-in-source.sh
    stale_path=lib/commands/no-longer-in-source.sh

    printf 'tracked file from removed source\n' > "$stale_file"
    write_marker_checksums "$tool_dir"

    assert_install_succeeds "$home_dir" "$tool"

    assert_path_missing "$stale_file"
    assert_not_contains "$tool_dir/.coderail-install" "$stale_path"
    assert_marker_checksums "$tool_dir"
}

assert_install_unknown_tool_fails() {
    home_dir=$tmp_dir/home-unknown-tool

    mkdir "$home_dir"

    assert_install_fails "$home_dir" unknown
    assert_path_missing "$home_dir/.codex"
    assert_path_missing "$home_dir/.copilot"
    assert_path_missing "$home_dir/.claude"
    assert_path_missing "$home_dir/.gemini"
}

assert_multi_tool_install() {
    home_dir=$tmp_dir/home-multiple-tools

    mkdir "$home_dir"

    assert_install_succeeds "$home_dir" codex copilot claude gemini

    assert_installed_files_in_home "$home_dir" codex
    assert_installed_files_in_home "$home_dir" copilot
    assert_installed_files_in_home "$home_dir" claude
    assert_installed_files_in_home "$home_dir" gemini
}

assert_install_without_write_permission_fails() {
    tool=$1
    home_dir=$(home_dir_for_case_tool no-write "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")

    mkdir "$home_dir"
    chmod a-w "$home_dir"

    set +e
    HOME=$home_dir "$CR" install "$tool" >/dev/null 2>&1
    status=$?
    set -e

    chmod u+w "$home_dir"

    [ "$status" -ne 0 ] || fail "install unexpectedly succeeded without write permission"
    assert_path_missing "$tool_dir/.coderail-install"
}

assert_untracked_file_without_force_is_preserved() {
    tool=$1
    home_dir=$(home_dir_for_case_tool untracked "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    agent_file=$tool_dir/$(agent_file_name "$tool")

    mkdir "$home_dir"
    mkdir "$tool_dir"
    printf 'untracked user file for %s\n' "$tool" > "$agent_file"

    assert_install_fails "$home_dir" "$tool"

    assert_contains "$agent_file" "untracked user file for $tool"
    assert_path_missing "$tool_dir/.coderail-install"
}

assert_untracked_file_with_force_is_overwritten() {
    tool=$1
    home_dir=$(home_dir_for_case_tool force-untracked "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    agent_file=$tool_dir/$(agent_file_name "$tool")

    mkdir "$home_dir"
    mkdir "$tool_dir"
    printf 'untracked user file for %s\n' "$tool" > "$agent_file"

    assert_install_succeeds "$home_dir" --force "$tool"

    assert_installed_files_in_home "$home_dir" "$tool"
    assert_not_contains "$agent_file" "untracked user file for $tool"
}

assert_force_does_not_replace_tool_root_file() {
    tool=$1
    home_dir=$(home_dir_for_case_tool root-file "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")

    mkdir "$home_dir"
    printf 'user-owned tool root file for %s\n' "$tool" > "$tool_dir"

    assert_install_fails "$home_dir" --force "$tool"

    assert_file "$tool_dir"
    assert_contains "$tool_dir" "user-owned tool root file for $tool"
}

print_tests_header "Installation Tests"
test "Install unknown tool fails" assert_install_unknown_tool_fails
test "Install multiple tools" assert_multi_tool_install
test "Clean install for codex tool" assert_clean_install codex
test "Reinstall tracked modified files for codex tool" assert_reinstall_overwrites_tracked_files codex
test "Reinstall keeps untracked changes for codex tool" assert_reinstall_keeps_modified_files codex
test "Force reinstall overwrites changed files for codex tool" assert_force_reinstall_overwrites_modified_files codex
test "Reinstall restores missing file for codex tool" assert_reinstall_restores_missing_tracked_file codex
test "Reinstall removes stale tracked file for codex tool" assert_reinstall_removes_stale_tracked_file codex
test "Install without write permission fails for codex tool" assert_install_without_write_permission_fails codex
test "Install preserves untracked file for codex tool" assert_untracked_file_without_force_is_preserved codex
test "Force install overwrites untracked file for codex tool" assert_untracked_file_with_force_is_overwritten codex
test "Force install preserves tool root file for codex tool" assert_force_does_not_replace_tool_root_file codex
test "Clean install for copilot tool" assert_clean_install copilot
test "Reinstall tracked modified files for copilot tool" assert_reinstall_overwrites_tracked_files copilot
test "Reinstall keeps untracked changes for copilot tool" assert_reinstall_keeps_modified_files copilot
test "Force reinstall overwrites changed files for copilot tool" assert_force_reinstall_overwrites_modified_files copilot
test "Reinstall restores missing file for copilot tool" assert_reinstall_restores_missing_tracked_file copilot
test "Reinstall removes stale tracked file for copilot tool" assert_reinstall_removes_stale_tracked_file copilot
test "Install without write permission fails for copilot tool" assert_install_without_write_permission_fails copilot
test "Install preserves untracked file for copilot tool" assert_untracked_file_without_force_is_preserved copilot
test "Force install overwrites untracked file for copilot tool" assert_untracked_file_with_force_is_overwritten copilot
test "Force install preserves tool root file for copilot tool" assert_force_does_not_replace_tool_root_file copilot
test "Clean install for claude tool" assert_clean_install claude
test "Reinstall tracked modified files for claude tool" assert_reinstall_overwrites_tracked_files claude
test "Reinstall keeps untracked changes for claude tool" assert_reinstall_keeps_modified_files claude
test "Force reinstall overwrites changed files for claude tool" assert_force_reinstall_overwrites_modified_files claude
test "Reinstall restores missing file for claude tool" assert_reinstall_restores_missing_tracked_file claude
test "Reinstall removes stale tracked file for claude tool" assert_reinstall_removes_stale_tracked_file claude
test "Install without write permission fails for claude tool" assert_install_without_write_permission_fails claude
test "Install preserves untracked file for claude tool" assert_untracked_file_without_force_is_preserved claude
test "Force install overwrites untracked file for claude tool" assert_untracked_file_with_force_is_overwritten claude
test "Force install preserves tool root file for claude tool" assert_force_does_not_replace_tool_root_file claude
test "Clean install for gemini tool" assert_clean_install gemini
test "Reinstall tracked modified files for gemini tool" assert_reinstall_overwrites_tracked_files gemini
test "Reinstall keeps untracked changes for gemini tool" assert_reinstall_keeps_modified_files gemini
test "Force reinstall overwrites changed files for gemini tool" assert_force_reinstall_overwrites_modified_files gemini
test "Reinstall restores missing file for gemini tool" assert_reinstall_restores_missing_tracked_file gemini
test "Reinstall removes stale tracked file for gemini tool" assert_reinstall_removes_stale_tracked_file gemini
test "Install without write permission fails for gemini tool" assert_install_without_write_permission_fails gemini
test "Install preserves untracked file for gemini tool" assert_untracked_file_without_force_is_preserved gemini
test "Force install overwrites untracked file for gemini tool" assert_untracked_file_with_force_is_overwritten gemini
test "Force install preserves tool root file for gemini tool" assert_force_does_not_replace_tool_root_file gemini
print_tests_summary

if some_tests_failed; then
    exit 1
fi
