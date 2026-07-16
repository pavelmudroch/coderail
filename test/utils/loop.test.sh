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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-loop-utils-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"
. "$PROJECT_ROOT/lib/utils/loop.sh"

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

assert_file_content() {
    file=$1
    expected=$2
    expected_file=$tmp_dir/expected-content

    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$file" >/dev/null ||
        fail "$file content differs"
}

assert_loop_setup_creates_ignore() {
    project_dir=$tmp_dir/create

    mkdir "$project_dir"

    assert_equals "$(loop_setup "$project_dir")" true
    assert_file_content "$project_dir/.coderail/loop/.gitignore" "*
!.gitignore"
    assert_equals "$(loop_setup "$project_dir")" false
}

assert_loop_setup_preserves_existing_ignore() {
    project_dir=$tmp_dir/existing

    mkdir -p "$project_dir/.coderail/loop"
    printf 'user ignore\n' > "$project_dir/.coderail/loop/.gitignore"

    assert_equals "$(loop_setup "$project_dir")" false
    assert_file_content "$project_dir/.coderail/loop/.gitignore" "user ignore"
}

assert_loop_setup_fails_for_regular_loop_file() {
    project_dir=$tmp_dir/regular-loop-file

    mkdir -p "$project_dir/.coderail"
    : > "$project_dir/.coderail/loop"

    set +e
    output=$(loop_setup "$project_dir")
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
        fail "loop setup unexpectedly succeeded"
    fi

    assert_equals "$output" ""
}

print_tests_header "Loop Utils Tests"
test "Loop setup creates and reports new ignore" assert_loop_setup_creates_ignore
test "Loop setup preserves existing ignore" assert_loop_setup_preserves_existing_ignore
test "Loop setup fails for regular loop file" assert_loop_setup_fails_for_regular_loop_file
print_tests_summary

if some_tests_failed; then
    exit 1
fi
