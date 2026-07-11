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

root_instruction_file_name() {
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

assert_no_skill_tags() {
    target_dir=$1

    find "$target_dir" -type f ! -name '.coderail-install' | sort | while IFS= read -r target_file; do
        assert_not_contains "$target_file" '<skill>'
        assert_not_contains "$target_file" '</skill>'
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

assert_root_instruction() {
    tool_dir=$1
    tool=$2
    root_file=$tool_dir/$(root_instruction_file_name "$tool")

    assert_file "$root_file"
    assert_translated_file "$ROOT_DIR/instructions/AGENTS.md" "$root_file" "$tool"
}

assert_skill_files() {
    tool_dir=$1
    tool=$2
    skill_file=$tool_dir/skills/ticket-pick/SKILL.md
    support_file=$tool_dir/skills/ticket-create/examples/ticket.md

    assert_file "$skill_file"
    assert_file "$support_file"
    assert_translated_file "$ROOT_DIR/instructions/skills/ticket-pick/SKILL.md" "$skill_file" "$tool"
    assert_translated_file "$ROOT_DIR/instructions/skills/ticket-create/examples/ticket.md" "$support_file" "$tool"
    assert_contains "$skill_file" "$(skill_reference "$tool")"
}

assert_agent_files() {
    tool_dir=$1
    tool=$2
    source_agent=$ROOT_DIR/instructions/agents/worker.md

    case "$tool" in
        codex)
            agent_file=$tool_dir/agents/worker.toml

            assert_file "$agent_file"
            assert_contains "$agent_file" 'name = "worker"'
            assert_contains "$agent_file" 'description = "Agent that executes delegated tasks."'
            assert_contains "$agent_file" 'developer_instructions = """'
            assert_contains "$agent_file" 'You are the execution role.'
            assert_path_missing "$tool_dir/agents/worker.md"
            assert_path_missing "$tool_dir/agents/worker.agent.md"
            ;;
        copilot)
            agent_file=$tool_dir/agents/worker.agent.md

            assert_file "$agent_file"
            assert_translated_file "$source_agent" "$agent_file" "$tool"
            assert_path_missing "$tool_dir/agents/worker.md"
            assert_path_missing "$tool_dir/agents/worker.toml"
            ;;
        claude)
            agent_file=$tool_dir/agents/worker.md

            assert_file "$agent_file"
            assert_translated_file "$source_agent" "$agent_file" "$tool"
            assert_path_missing "$tool_dir/agents/worker.agent.md"
            assert_path_missing "$tool_dir/agents/worker.toml"
            ;;
        gemini)
            assert_path_missing "$tool_dir/agents"
            ;;
        *)
            fail "unknown tool: $tool"
            ;;
    esac
}

assert_no_legacy_cli_tree() {
    tool_dir=$1

    assert_path_missing "$tool_dir/bin"
    assert_path_missing "$tool_dir/lib"
    assert_path_missing "$tool_dir/instructions"
}

assert_installed_files_in_tool_dir() {
    tool_dir=$1
    tool=$2

    assert_dir "$tool_dir"
    assert_root_instruction "$tool_dir" "$tool"
    assert_skill_files "$tool_dir" "$tool"
    assert_agent_files "$tool_dir" "$tool"
    assert_no_legacy_cli_tree "$tool_dir"
    assert_no_skill_tags "$tool_dir"
    assert_marker_checksums "$tool_dir"
}

assert_installed_files_in_home() {
    home_dir=$1
    tool=$2
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")

    assert_installed_files_in_tool_dir "$tool_dir" "$tool"
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

managed_file_for_tool_dir() {
    tool_dir=$1

    printf '%s/skills/ticket-pick/SKILL.md\n' "$tool_dir"
}

modify_managed_file() {
    tool=$1
    tool_dir=$2
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    printf 'modified managed file for %s\n' "$tool" > "$managed_file"
}

assert_modified_managed_file_is_refused() {
    tool=$1
    home_dir=$(home_dir_for_case_tool modified "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    modify_managed_file "$tool" "$tool_dir"

    assert_install_fails "$home_dir" "$tool"

    assert_contains "$managed_file" "modified managed file for $tool"
}

assert_force_overwrites_modified_managed_file() {
    tool=$1
    home_dir=$(home_dir_for_case_tool force-modified "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    modify_managed_file "$tool" "$tool_dir"

    assert_install_succeeds "$home_dir" --force "$tool"

    assert_translated_file "$ROOT_DIR/instructions/skills/ticket-pick/SKILL.md" "$managed_file" "$tool"
    assert_not_contains "$managed_file" "modified managed file for $tool"
    assert_marker_checksums "$tool_dir"
}

assert_missing_managed_file_is_restored() {
    tool=$1
    home_dir=$(home_dir_for_case_tool missing "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    managed_file=$(managed_file_for_tool_dir "$tool_dir")

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    rm -f "$managed_file"
    assert_path_missing "$managed_file"

    assert_install_succeeds "$home_dir" "$tool"

    assert_translated_file "$ROOT_DIR/instructions/skills/ticket-pick/SKILL.md" "$managed_file" "$tool"
    assert_marker_checksums "$tool_dir"
}

assert_stale_managed_file_is_removed() {
    tool=$1
    home_dir=$(home_dir_for_case_tool stale "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    stale_file=$tool_dir/skills/no-longer/SKILL.md
    stale_path=skills/no-longer/SKILL.md

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    mkdir -p "$(dirname "$stale_file")"
    printf 'tracked file from removed source\n' > "$stale_file"
    write_marker_checksums "$tool_dir"

    assert_install_succeeds "$home_dir" "$tool"

    assert_path_missing "$stale_file"
    assert_not_contains "$tool_dir/.coderail-install" "$stale_path"
    assert_marker_checksums "$tool_dir"
}

assert_modified_stale_managed_file_is_refused() {
    tool=$1
    home_dir=$(home_dir_for_case_tool modified-stale "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    stale_file=$tool_dir/skills/no-longer/SKILL.md

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    mkdir -p "$(dirname "$stale_file")"
    printf 'tracked file from removed source\n' > "$stale_file"
    write_marker_checksums "$tool_dir"
    printf 'modified stale managed file for %s\n' "$tool" > "$stale_file"

    assert_install_fails "$home_dir" "$tool"

    assert_contains "$stale_file" "modified stale managed file for $tool"
}

assert_force_removes_modified_stale_managed_file() {
    tool=$1
    home_dir=$(home_dir_for_case_tool force-modified-stale "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    stale_file=$tool_dir/skills/no-longer/SKILL.md

    mkdir "$home_dir"
    assert_install_succeeds "$home_dir" "$tool"
    mkdir -p "$(dirname "$stale_file")"
    printf 'tracked file from removed source\n' > "$stale_file"
    write_marker_checksums "$tool_dir"
    printf 'modified stale managed file for %s\n' "$tool" > "$stale_file"

    assert_install_succeeds "$home_dir" --force "$tool"

    assert_path_missing "$stale_file"
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
    root_file=$tool_dir/$(root_instruction_file_name "$tool")

    mkdir "$home_dir"
    mkdir "$tool_dir"
    printf 'untracked user file for %s\n' "$tool" > "$root_file"

    assert_install_fails "$home_dir" "$tool"

    assert_contains "$root_file" "untracked user file for $tool"
    assert_path_missing "$tool_dir/.coderail-install"
}

assert_untracked_file_with_force_is_overwritten() {
    tool=$1
    home_dir=$(home_dir_for_case_tool force-untracked "$tool")
    tool_dir=$(tool_dir_for_home_tool "$home_dir" "$tool")
    root_file=$tool_dir/$(root_instruction_file_name "$tool")

    mkdir "$home_dir"
    mkdir "$tool_dir"
    printf 'untracked user file for %s\n' "$tool" > "$root_file"

    assert_install_succeeds "$home_dir" --force "$tool"

    assert_installed_files_in_home "$home_dir" "$tool"
    assert_not_contains "$root_file" "untracked user file for $tool"
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

    assert_installed_files_in_tool_dir "$override_dir" "$tool"
    assert_path_missing "$default_tool_dir"
}

copy_project_for_install_case() {
    case_name=$1
    case_root=$tmp_dir/project-$case_name

    mkdir -p "$case_root/bin"
    mkdir -p "$case_root/lib/commands"
    mkdir -p "$case_root/lib/utils"
    mkdir -p "$case_root/instructions"
    cp "$ROOT_DIR/bin/cr" "$case_root/bin/cr"
    cp "$ROOT_DIR/lib/commands/install.sh" "$case_root/lib/commands/install.sh"
    cp "$ROOT_DIR/lib/utils/log.sh" "$case_root/lib/utils/log.sh"
    cp "$ROOT_DIR/lib/utils/args.sh" "$case_root/lib/utils/args.sh"
    cp -R "$ROOT_DIR/instructions/." "$case_root/instructions"
    chmod +x "$case_root/bin/cr"

    printf '%s\n' "$case_root"
}

write_user_only_policy_skill() {
    case_root=$1
    skill_dir=$case_root/instructions/skills/policy-test

    mkdir -p "$skill_dir"
    cat > "$skill_dir/SKILL.md" <<'EOF'
---
name: policy-test
description: Policy test skill.
disable-model-invocation: true
---
Use <skill>ticket-pick</skill>.
EOF
}

write_conflicting_policy_skill() {
    case_root=$1
    skill_dir=$case_root/instructions/skills/policy-test

    mkdir -p "$skill_dir"
    cat > "$skill_dir/SKILL.md" <<'EOF'
---
name: policy-test
description: Policy test skill.
disable-model-invocation: false
allow_implicit_invocation: false
---
Policy conflict.
EOF
}

assert_policy_key_normalization() {
    case_root=$(copy_project_for_install_case policy)
    home_dir=$tmp_dir/home-policy

    mkdir "$home_dir"
    write_user_only_policy_skill "$case_root"

    HOME=$home_dir "$case_root/bin/cr" install codex copilot claude gemini >/dev/null

    codex_skill=$home_dir/.codex/skills/policy-test/SKILL.md
    copilot_skill=$home_dir/.copilot/skills/policy-test/SKILL.md
    claude_skill=$home_dir/.claude/skills/policy-test/SKILL.md
    gemini_skill=$home_dir/.gemini/skills/policy-test/SKILL.md

    assert_contains "$codex_skill" 'allow_implicit_invocation: false'
    assert_not_contains "$codex_skill" 'disable-model-invocation'
    assert_contains "$codex_skill" '$ticket-pick'

    assert_not_contains "$copilot_skill" 'allow_implicit_invocation'
    assert_contains "$copilot_skill" 'disable-model-invocation: true'
    assert_contains "$copilot_skill" '/ticket-pick'

    assert_contains "$claude_skill" 'disable-model-invocation: true'
    assert_not_contains "$claude_skill" 'allow_implicit_invocation'
    assert_contains "$claude_skill" '/ticket-pick'

    assert_not_contains "$gemini_skill" 'allow_implicit_invocation'
    assert_contains "$gemini_skill" 'disable-model-invocation: true'
    assert_contains "$gemini_skill" '/ticket-pick'
}

assert_conflicting_policy_fails() {
    case_root=$(copy_project_for_install_case policy-conflict)
    home_dir=$tmp_dir/home-policy-conflict

    mkdir "$home_dir"
    write_conflicting_policy_skill "$case_root"

    set +e
    HOME=$home_dir "$case_root/bin/cr" install codex >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "install unexpectedly succeeded with conflicting policy"
    assert_path_missing "$home_dir/.codex"
}

print_tests_header "Installation Tests"
test "Install unknown tool fails" assert_install_unknown_tool_fails
test "Install multiple tools" assert_multi_tool_install
test "Policy keys normalize per tool" assert_policy_key_normalization
test "Conflicting policy fails" assert_conflicting_policy_fails

for tool in codex copilot claude gemini; do
    test "Clean install for $tool tool" assert_clean_install "$tool"
    test "Target home override for $tool tool" assert_tool_home_override "$tool"
    test "Modified managed file refused for $tool tool" assert_modified_managed_file_is_refused "$tool"
    test "Force overwrites modified managed file for $tool tool" assert_force_overwrites_modified_managed_file "$tool"
    test "Missing managed file restored for $tool tool" assert_missing_managed_file_is_restored "$tool"
    test "Stale managed file removed for $tool tool" assert_stale_managed_file_is_removed "$tool"
    test "Modified stale managed file refused for $tool tool" assert_modified_stale_managed_file_is_refused "$tool"
    test "Force removes modified stale managed file for $tool tool" assert_force_removes_modified_stale_managed_file "$tool"
    test "Install without write permission fails for $tool tool" assert_install_without_write_permission_fails "$tool"
    test "Install preserves untracked file for $tool tool" assert_untracked_file_without_force_is_preserved "$tool"
    test "Force install overwrites untracked file for $tool tool" assert_untracked_file_with_force_is_overwritten "$tool"
    test "Force install preserves tool root file for $tool tool" assert_force_does_not_replace_tool_root_file "$tool"
done

print_tests_summary

if some_tests_failed; then
    exit 1
fi
