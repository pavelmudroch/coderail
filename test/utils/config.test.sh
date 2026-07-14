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

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-config-utils-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"

error() {
    echo "error: $*" >&2
    exit 2
}

. "$PROJECT_ROOT/lib/utils/config.sh"

cleanup() {
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

write_user_config() {
    home_dir=$1
    shift

    mkdir -p "$home_dir/.coderail"
    printf '%s\n' "$@" > "$home_dir/.coderail/config.ini"
}

write_repo_config() {
    work_dir=$1
    shift

    mkdir -p "$work_dir/.coderail"
    printf '%s\n' "$@" > "$work_dir/.coderail/conf.ini"
}

load_default_tool_from_dir() {
    work_dir=$1
    home_dir=$2

    (
        cd "$work_dir"
        HOME=$home_dir
        export HOME
        load_default_tool
        printf '%s\n' "$default_tool"
    )
}

assert_missing_config_leaves_default_empty() {
    home_dir=$tmp_dir/home-missing
    work_dir=$tmp_dir/work-missing

    mkdir "$home_dir" "$work_dir"

    assert_equals "$(load_default_tool_from_dir "$work_dir" "$home_dir")" ""
}

assert_user_config_sets_default_tool() {
    home_dir=$tmp_dir/home-user
    work_dir=$tmp_dir/work-user

    mkdir "$home_dir" "$work_dir"
    write_user_config "$home_dir" "default_tool = codex"

    assert_equals "$(load_default_tool_from_dir "$work_dir" "$home_dir")" codex
}

assert_repo_config_overrides_user_with_comments() {
    home_dir=$tmp_dir/home-repo
    work_dir=$tmp_dir/work-repo

    mkdir "$home_dir" "$work_dir"
    write_user_config "$home_dir" "default_tool = codex"
    write_repo_config "$work_dir" \
        "# default_tool = gemini" \
        " default_tool = claude # inline comment"

    assert_equals "$(load_default_tool_from_dir "$work_dir" "$home_dir")" claude
}

print_tests_header "Config Utils Tests"
test "Missing config leaves default empty" assert_missing_config_leaves_default_empty
test "User config sets default tool" assert_user_config_sets_default_tool
test "Repo config overrides user with comments" assert_repo_config_overrides_user_with_comments
print_tests_summary

if some_tests_failed; then
    exit 1
fi
