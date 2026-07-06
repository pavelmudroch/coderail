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

tool_dir_for_tool() {
    tool=$1
    printf '%s/%s\n' "$(home_dir_for_tool "$tool")" "$(tool_dir_name "$tool")"
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

assert_installed_files() {
    tool=$1
    tool_dir=$(tool_dir_for_tool "$tool")
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

assert_clean_install() {
    tool=$1
    home_dir=$(home_dir_for_tool "$tool")

    mkdir "$home_dir"

    HOME=$home_dir "$CR" install "$tool" >/dev/null

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

    HOME=$home_dir "$CR" install "$tool" >/dev/null

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

    HOME=$home_dir "$CR" install --force "$tool" >/dev/null

    assert_reinstalled_modified_files "$tool"
}

print_tests_header "Installation Tests"
test "Clean install for codex tool" assert_clean_install codex
test "Reinstall tracked modified files for codex tool" assert_reinstall_overwrites_tracked_files codex
test "Reinstall keeps untracked changes for codex tool" assert_reinstall_keeps_modified_files codex
test "Force reinstall overwrites changed files for codex tool" assert_force_reinstall_overwrites_modified_files codex
test "Clean install for copilot tool" assert_clean_install copilot
test "Reinstall tracked modified files for copilot tool" assert_reinstall_overwrites_tracked_files copilot
test "Reinstall keeps untracked changes for copilot tool" assert_reinstall_keeps_modified_files copilot
test "Force reinstall overwrites changed files for copilot tool" assert_force_reinstall_overwrites_modified_files copilot
test "Clean install for claude tool" assert_clean_install claude
test "Reinstall tracked modified files for claude tool" assert_reinstall_overwrites_tracked_files claude
test "Reinstall keeps untracked changes for claude tool" assert_reinstall_keeps_modified_files claude
test "Force reinstall overwrites changed files for claude tool" assert_force_reinstall_overwrites_modified_files claude
test "Clean install for gemini tool" assert_clean_install gemini
test "Reinstall tracked modified files for gemini tool" assert_reinstall_overwrites_tracked_files gemini
test "Reinstall keeps untracked changes for gemini tool" assert_reinstall_keeps_modified_files gemini
test "Force reinstall overwrites changed files for gemini tool" assert_force_reinstall_overwrites_modified_files gemini
print_tests_summary

if some_tests_failed; then
    exit 1
fi
