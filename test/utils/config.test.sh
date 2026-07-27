#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

PROJECT_ROOT=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

CR=$PROJECT_ROOT/bin/cr

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-config-utils-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"

error() {
    echo "error: $*" >&2
    exit 2
}

. "$PROJECT_ROOT/lib/utils/config.sh"

inaccessible_config_dir=

cleanup() {
    if [ -n "$inaccessible_config_dir" ]; then
        chmod 700 "$inaccessible_config_dir"
    fi

    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_equals() {
    actual=$1
    expected=$2

    [ "$actual" = "$expected" ] ||
        fail "expected '$expected', got '$actual'"
}

assert_contains() {
    file=$1
    text=$2

    grep -F "$text" "$file" >/dev/null ||
        fail "$file does not contain: $text"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 is not empty"
}

write_user_config() {
    config_test_home_dir=$1
    shift

    mkdir -p "$config_test_home_dir/.coderail"
    printf '%s\n' "$@" > "$config_test_home_dir/.coderail/config.ini"
}

write_repo_legacy_config() {
    config_test_work_dir=$1
    shift

    mkdir -p "$config_test_work_dir/.coderail"
    printf '%s\n' "$@" > "$config_test_work_dir/.coderail/conf.ini"
}

write_repo_config() {
    config_test_work_dir=$1
    shift

    mkdir -p "$config_test_work_dir/.coderail"
    printf '%s\n' "$@" > "$config_test_work_dir/.coderail/config.ini"
}

run_loader() {
    work_dir=$1
    home_dir=$2
    stdout_file=$3
    stderr_file=$4

    (
        cd "$work_dir"
        if [ "$home_dir" = none ]; then
            unset HOME
        else
            HOME=$home_dir
            export HOME
        fi

        load_effective_config "$work_dir"
        printf 'default_tool=%s\nauto_review=%s\n' \
            "$default_tool" \
            "$auto_review"
    ) > "$stdout_file" 2> "$stderr_file"
}

run_cr() {
    launch_dir=$1
    home_dir=$2
    stdout_file=$3
    stderr_file=$4
    shift 4

    (
        cd "$launch_dir"
        HOME=$home_dir
        export HOME
        "$CR" "$@"
    ) > "$stdout_file" 2> "$stderr_file"
}

assert_cr_fails_before_dispatch_with_reason() {
    launch_dir=$1
    home_dir=$2
    expected_file=$3
    expected_reason=$4
    shift 4
    stdout_file=$tmp_dir/cr-stdout
    stderr_file=$tmp_dir/cr-stderr

    if run_cr "$launch_dir" "$home_dir" "$stdout_file" "$stderr_file" "$@"; then
        fail "cr unexpectedly succeeded: $*"
    fi

    assert_file_empty "$stdout_file"
    assert_contains "$stderr_file" "$expected_file"
    assert_contains "$stderr_file" "$expected_reason"
}

assert_cr_fails_before_dispatch() {
    launch_dir=$1
    home_dir=$2
    expected_file=$3
    shift 3

    assert_cr_fails_before_dispatch_with_reason \
        "$launch_dir" \
        "$home_dir" \
        "$expected_file" \
        "invalid value for auto_review: invalid" \
        "$@"
}

assert_effective_config() {
    work_dir=$1
    home_dir=$2
    expected_default_tool=$3
    expected_auto_review=$4
    stdout_file=$tmp_dir/loader-stdout
    stderr_file=$tmp_dir/loader-stderr

    run_loader "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" ||
        fail "configuration loader failed"

    assert_equals "$(sed -n '1p' "$stdout_file")" \
        "default_tool=$expected_default_tool"
    assert_equals "$(sed -n '2p' "$stdout_file")" \
        "auto_review=$expected_auto_review"
    assert_file_empty "$stderr_file"
}

assert_loader_fails() {
    work_dir=$1
    home_dir=$2
    expected_file=$3
    expected_reason=$4
    stdout_file=$tmp_dir/loader-stdout
    stderr_file=$tmp_dir/loader-stderr

    if run_loader "$work_dir" "$home_dir" "$stdout_file" "$stderr_file"; then
        fail "configuration loader unexpectedly succeeded"
    fi

    assert_contains "$stderr_file" "$expected_file"
    assert_contains "$stderr_file" "$expected_reason"
}

assert_missing_config_leaves_effective_values_empty() {
    home_dir=$tmp_dir/home-missing
    work_dir=$tmp_dir/work-missing

    mkdir "$home_dir" "$work_dir"

    assert_effective_config "$work_dir" "$home_dir" "" ""
}

assert_layers_merge_by_key_precedence() {
    home_dir=$tmp_dir/home-merge
    work_dir=$tmp_dir/work-merge

    mkdir "$home_dir" "$work_dir"
    write_user_config "$home_dir" \
        "default_tool = codex" \
        "auto_review = false"
    write_repo_legacy_config "$work_dir" \
        "default_tool = claude" \
        "auto_review = true"
    write_repo_config "$work_dir" "default_tool = gemini"

    stdout_file=$tmp_dir/loader-stdout
    stderr_file=$tmp_dir/loader-stderr
    run_loader "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" ||
        fail "configuration loader failed"

    assert_equals "$(sed -n '1p' "$stdout_file")" "default_tool=gemini"
    assert_equals "$(sed -n '2p' "$stdout_file")" "auto_review=true"
    assert_contains "$stderr_file" "using repository config.ini, but deprecated repository config"
}

assert_whitespace_comments_and_blank_lines_are_accepted() {
    home_dir=$tmp_dir/home-syntax
    work_dir=$tmp_dir/work-syntax

    mkdir "$home_dir" "$work_dir"
    write_user_config "$home_dir" \
        "" \
        "  # user default" \
        " default_tool = codex # inline comment"
    write_repo_config "$work_dir" \
        " " \
        "# repository setting" \
        " auto_review = true "

    assert_effective_config "$work_dir" "$home_dir" codex true
}

assert_git_root_configuration_is_discovered_from_subdirectory() {
    home_dir=$tmp_dir/home-git-root
    repo_dir=$tmp_dir/repo-git-root
    nested_dir=$repo_dir/nested/path

    mkdir "$home_dir" "$repo_dir"
    git init -q "$repo_dir"
    mkdir -p "$nested_dir"
    write_repo_config "$repo_dir" "default_tool = copilot"

    assert_effective_config "$nested_dir" "$home_dir" copilot ""
}

assert_non_git_base_uses_its_own_configuration() {
    home_dir=$tmp_dir/home-non-git
    parent_dir=$tmp_dir/parent-non-git
    work_dir=$parent_dir/work-non-git

    mkdir "$home_dir" "$parent_dir"
    mkdir "$work_dir"
    write_repo_config "$parent_dir" "default_tool = codex"
    write_repo_config "$work_dir" "default_tool = claude"

    assert_effective_config "$work_dir" "$home_dir" claude ""
}

assert_non_git_base_does_not_search_ancestors() {
    home_dir=$tmp_dir/home-no-ancestor
    parent_dir=$tmp_dir/parent-no-ancestor
    work_dir=$parent_dir/work-no-ancestor

    mkdir "$home_dir" "$parent_dir"
    mkdir "$work_dir"
    write_repo_config "$parent_dir" "default_tool = codex"

    assert_effective_config "$work_dir" "$home_dir" "" ""
}

assert_malformed_line_fails() {
    home_dir=$tmp_dir/home-malformed
    work_dir=$tmp_dir/work-malformed

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "default_tool codex"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "malformed line 1"
}

assert_empty_key_fails() {
    home_dir=$tmp_dir/home-empty-key
    work_dir=$tmp_dir/work-empty-key

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" " = codex"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "empty key"
}

assert_empty_value_fails() {
    home_dir=$tmp_dir/home-empty-value
    work_dir=$tmp_dir/work-empty-value

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "default_tool = "

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "empty value"
}

assert_duplicate_key_fails() {
    home_dir=$tmp_dir/home-duplicate
    work_dir=$tmp_dir/work-duplicate

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" \
        "default_tool = codex" \
        "default_tool = claude"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "duplicate key: default_tool"
}

assert_unknown_key_fails() {
    home_dir=$tmp_dir/home-unknown
    work_dir=$tmp_dir/work-unknown

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "tool = codex"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "unknown key: tool"
}

assert_invalid_default_tool_fails() {
    home_dir=$tmp_dir/home-invalid-tool
    work_dir=$tmp_dir/work-invalid-tool

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "default_tool = unknown"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "invalid value for default_tool: unknown"
}

assert_invalid_auto_review_fails() {
    home_dir=$tmp_dir/home-invalid-review
    work_dir=$tmp_dir/work-invalid-review

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "auto_review = yes"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/config.ini" \
        "invalid value for auto_review: yes"
}

assert_unreadable_path_fails() {
    home_dir=$tmp_dir/home-unreadable
    work_dir=$tmp_dir/work-unreadable
    config_file=$work_dir/.coderail/config.ini

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "default_tool = codex"
    chmod 000 "$config_file"

    assert_loader_fails "$work_dir" "$home_dir" "$config_file" "unreadable"
}

assert_nonregular_path_fails() {
    home_dir=$tmp_dir/home-nonregular
    work_dir=$tmp_dir/work-nonregular
    config_file=$work_dir/.coderail/config.ini

    mkdir "$home_dir" "$work_dir"
    mkdir -p "$config_file"

    assert_loader_fails "$work_dir" "$home_dir" "$config_file" "not a regular file"
}

assert_dangling_config_symlink_fails() {
    config_layer=$1
    home_dir=$tmp_dir/home-dangling-loader-$config_layer
    work_dir=$tmp_dir/work-dangling-loader-$config_layer

    mkdir "$home_dir" "$work_dir"

    case "$config_layer" in
        user) config_file=$home_dir/.coderail/config.ini ;;
        legacy) config_file=$work_dir/.coderail/conf.ini ;;
        canonical) config_file=$work_dir/.coderail/config.ini ;;
    esac

    mkdir -p "$(dirname "$config_file")"
    ln -s "$tmp_dir/missing-loader-$config_layer-config" "$config_file"

    assert_loader_fails "$work_dir" "$home_dir" "$config_file" "not a regular file"
}

assert_overridden_layer_is_still_validated() {
    home_dir=$tmp_dir/home-overridden
    work_dir=$tmp_dir/work-overridden

    mkdir "$home_dir" "$work_dir"
    write_repo_legacy_config "$work_dir" "default_tool = unknown"
    write_repo_config "$work_dir" "default_tool = codex"

    assert_loader_fails "$work_dir" "$home_dir" \
        "$work_dir/.coderail/conf.ini" \
        "invalid value for default_tool: unknown"
}

assert_legacy_only_warning_is_actionable() {
    home_dir=$tmp_dir/home-legacy-only
    work_dir=$tmp_dir/work-legacy-only
    stdout_file=$tmp_dir/loader-stdout
    stderr_file=$tmp_dir/loader-stderr

    mkdir "$home_dir" "$work_dir"
    write_repo_legacy_config "$work_dir" "default_tool = codex"

    run_loader "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" ||
        fail "configuration loader failed"

    assert_equals "$(sed -n '1p' "$stdout_file")" "default_tool=codex"
    assert_contains "$stderr_file" "deprecated"
    assert_contains "$stderr_file" "rename it to config.ini"
}

assert_invalid_config_stops_help_and_version() {
    home_dir=$tmp_dir/home-help-version
    work_dir=$tmp_dir/work-help-version
    config_file=$home_dir/.coderail/config.ini

    mkdir "$home_dir" "$work_dir"
    write_user_config "$home_dir" "auto_review = invalid"

    assert_cr_fails_before_dispatch "$work_dir" "$home_dir" "$config_file" --help
    assert_cr_fails_before_dispatch "$work_dir" "$home_dir" "$config_file" --version
}

assert_global_commands_use_launch_config_with_cwd() {
    home_dir=$tmp_dir/home-global-cwd
    launch_dir=$tmp_dir/launch-global-cwd
    selected_dir=$tmp_dir/selected-global-cwd
    config_file=$launch_dir/.coderail/config.ini

    mkdir "$home_dir" "$launch_dir" "$selected_dir"
    write_repo_config "$launch_dir" "auto_review = invalid"

    assert_cr_fails_before_dispatch \
        "$launch_dir" \
        "$home_dir" \
        "$config_file" \
        --cwd "$selected_dir" install codex
    assert_cr_fails_before_dispatch \
        "$launch_dir" \
        "$home_dir" \
        "$config_file" \
        --cwd "$selected_dir" uninstall codex
}

assert_project_command_uses_selected_config_with_cwd() {
    home_dir=$tmp_dir/home-project-cwd
    launch_dir=$tmp_dir/launch-project-cwd
    selected_dir=$tmp_dir/selected-project-cwd
    config_file=$selected_dir/.coderail/config.ini

    mkdir "$home_dir" "$launch_dir" "$selected_dir"
    write_repo_config "$selected_dir" "auto_review = invalid"

    assert_cr_fails_before_dispatch \
        "$launch_dir" \
        "$home_dir" \
        "$config_file" \
        --cwd "$selected_dir" init
    [ ! -e "$selected_dir/.coderail/tickets" ] ||
        fail "project command ran before configuration validation"
}

assert_invalid_config_stops_nested_subcommand() {
    home_dir=$tmp_dir/home-nested
    work_dir=$tmp_dir/work-nested
    config_file=$work_dir/.coderail/config.ini

    mkdir "$home_dir" "$work_dir"
    write_repo_config "$work_dir" "auto_review = invalid"

    assert_cr_fails_before_dispatch \
        "$work_dir" \
        "$home_dir" \
        "$config_file" \
        ticket create "must not be created"
    [ ! -e "$work_dir/.coderail/tickets" ] ||
        fail "nested command ran before configuration validation"
}

assert_dangling_config_symlink_stops_dispatch() {
    config_layer=$1
    home_dir=$tmp_dir/home-dangling-dispatch-$config_layer
    work_dir=$tmp_dir/work-dangling-dispatch-$config_layer

    mkdir "$home_dir" "$work_dir"

    case "$config_layer" in
        user) config_file=$home_dir/.coderail/config.ini ;;
        legacy) config_file=$work_dir/.coderail/conf.ini ;;
        canonical) config_file=$work_dir/.coderail/config.ini ;;
    esac

    mkdir -p "$(dirname "$config_file")"
    ln -s "$tmp_dir/missing-dispatch-$config_layer-config" "$config_file"

    assert_cr_fails_before_dispatch_with_reason \
        "$work_dir" "$home_dir" "$config_file" "not a regular file" --help
}

assert_inaccessible_config_path_fails() {
    config_layer=$1
    home_dir=$tmp_dir/home-inaccessible-$config_layer
    work_dir=$tmp_dir/work-inaccessible-$config_layer

    mkdir "$home_dir" "$work_dir"

    case "$config_layer" in
        user) config_file=$home_dir/.coderail/config.ini ;;
        legacy) config_file=$work_dir/.coderail/conf.ini ;;
        canonical) config_file=$work_dir/.coderail/config.ini ;;
    esac

    mkdir -p "$(dirname "$config_file")"
    printf '%s\n' "default_tool = codex" > "$config_file"
    inaccessible_config_dir=$(dirname "$config_file")
    chmod 000 "$inaccessible_config_dir"

    assert_loader_fails "$work_dir" "$home_dir" "$config_file" "unreadable"
    assert_cr_fails_before_dispatch_with_reason \
        "$work_dir" "$home_dir" "$config_file" "unreadable" --help

    chmod 700 "$inaccessible_config_dir"
    inaccessible_config_dir=
}

assert_legacy_warning_is_visible_in_all_log_modes() {
    home_dir=$tmp_dir/home-warning-modes
    work_dir=$tmp_dir/work-warning-modes
    stderr_file=$tmp_dir/cr-stderr
    stdout_file=$tmp_dir/cr-stdout

    mkdir "$home_dir" "$work_dir"
    write_repo_legacy_config "$work_dir" "default_tool = codex"

    for mode in normal verbose quiet; do
        case "$mode" in
            normal) run_cr "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" --help ;;
            verbose) run_cr "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" -v --help ;;
            quiet) run_cr "$work_dir" "$home_dir" "$stdout_file" "$stderr_file" -q --help ;;
        esac

        assert_contains "$stdout_file" "Usage:"
        assert_contains "$stderr_file" "deprecated"
        assert_contains "$stderr_file" "rename it to config.ini"
    done
}

print_tests_header "Config Utils Tests"
test "Missing config leaves effective values empty" \
    assert_missing_config_leaves_effective_values_empty
test "Layers merge by key precedence" assert_layers_merge_by_key_precedence
test "Whitespace, comments, and blank lines are accepted" \
    assert_whitespace_comments_and_blank_lines_are_accepted
test "Git-root config is discovered from a subdirectory" \
    assert_git_root_configuration_is_discovered_from_subdirectory
test "Non-Git base uses its own config" \
    assert_non_git_base_uses_its_own_configuration
test "Non-Git base does not search ancestors" \
    assert_non_git_base_does_not_search_ancestors
test "Malformed config line fails" assert_malformed_line_fails
test "Empty config key fails" assert_empty_key_fails
test "Empty config value fails" assert_empty_value_fails
test "Duplicate config key fails" assert_duplicate_key_fails
test "Unknown config key fails" assert_unknown_key_fails
test "Invalid default tool fails" assert_invalid_default_tool_fails
test "Invalid auto-review fails" assert_invalid_auto_review_fails
test "Unreadable config path fails" assert_unreadable_path_fails
test "Nonregular config path fails" assert_nonregular_path_fails
test "Dangling user config symlink fails" \
    assert_dangling_config_symlink_fails user
test "Dangling legacy config symlink fails" \
    assert_dangling_config_symlink_fails legacy
test "Dangling canonical config symlink fails" \
    assert_dangling_config_symlink_fails canonical
test "Overridden layer is validated" assert_overridden_layer_is_still_validated
test "Legacy-only config warning is actionable" \
    assert_legacy_only_warning_is_actionable
test "Invalid config stops help and version" \
    assert_invalid_config_stops_help_and_version
test "Global commands use launch config with cwd" \
    assert_global_commands_use_launch_config_with_cwd
test "Project command uses selected config with cwd" \
    assert_project_command_uses_selected_config_with_cwd
test "Invalid config stops nested subcommand" \
    assert_invalid_config_stops_nested_subcommand
test "Dangling user config symlink stops dispatch" \
    assert_dangling_config_symlink_stops_dispatch user
test "Dangling legacy config symlink stops dispatch" \
    assert_dangling_config_symlink_stops_dispatch legacy
test "Dangling canonical config symlink stops dispatch" \
    assert_dangling_config_symlink_stops_dispatch canonical
test "Inaccessible user config path fails" \
    assert_inaccessible_config_path_fails user
test "Inaccessible legacy config path fails" \
    assert_inaccessible_config_path_fails legacy
test "Inaccessible canonical config path fails" \
    assert_inaccessible_config_path_fails canonical
test "Legacy warning is visible in all log modes" \
    assert_legacy_warning_is_visible_in_all_log_modes
print_tests_summary

if some_tests_failed; then
    exit 1
fi
