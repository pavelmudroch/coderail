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

CR=$ROOT_DIR/bin/cr
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-init-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
    chmod -R u+w "$tmp_dir" 2>/dev/null || :
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

assert_empty_dir() {
    assert_dir "$1"

    if find "$1" -mindepth 1 -print -quit | grep . >/dev/null; then
        fail "directory should be empty: $1"
    fi
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_file_content() {
    file=$1
    expected=$2
    actual_file=$tmp_dir/actual-content
    expected_file=$tmp_dir/expected-content

    assert_file "$file"
    printf '%s\n' "$expected" > "$expected_file"
    cp "$file" "$actual_file"
    cmp "$expected_file" "$actual_file" >/dev/null ||
        fail "$file content differs"
}

assert_init_succeeds() {
    work_dir=$1

    "$CR" --cwd "$work_dir" init >/dev/null
}

assert_init_fails() {
    work_dir=$1

    set +e
    "$CR" --cwd "$work_dir" init >/dev/null 2>&1
    status=$?
    set -e

    [ "$status" -ne 0 ] || fail "init unexpectedly succeeded: cr --cwd $work_dir init"
}

assert_clean_init() {
    work_dir=$tmp_dir/clean

    mkdir "$work_dir"

    assert_init_succeeds "$work_dir"

    assert_dir "$work_dir/.coderail"
    assert_empty_dir "$work_dir/.coderail/tickets"
    assert_file_content "$work_dir/.coderail/conf.ini" "# conf.ini"
    assert_file_content "$work_dir/.coderail/test.map" "# test.map"
}

assert_init_preserves_existing_files() {
    work_dir=$tmp_dir/existing-files

    mkdir -p "$work_dir/.coderail"
    printf 'user conf\n' > "$work_dir/.coderail/conf.ini"
    printf 'project file\n' > "$work_dir/project.txt"

    assert_init_succeeds "$work_dir"

    assert_file_content "$work_dir/.coderail/conf.ini" "user conf"
    assert_file_content "$work_dir/project.txt" "project file"
    assert_empty_dir "$work_dir/.coderail/tickets"
    assert_file_content "$work_dir/.coderail/test.map" "# test.map"
}

assert_init_without_write_permission_fails() {
    work_dir=$tmp_dir/no-write

    mkdir "$work_dir"
    chmod a-w "$work_dir"

    assert_init_fails "$work_dir"

    chmod u+w "$work_dir"
    assert_path_missing "$work_dir/.coderail"
}

assert_init_target_file_fails() {
    work_file=$tmp_dir/target-file

    printf 'not a directory\n' > "$work_file"

    assert_init_fails "$work_file"
    assert_file_content "$work_file" "not a directory"
}

print_tests_header "Init Tests"
test "Clean init creates coderail files" assert_clean_init
test "Init preserves existing files" assert_init_preserves_existing_files
test "Init without write permission fails" assert_init_without_write_permission_fails
test "Init target file fails" assert_init_target_file_fails

print_tests_summary

if some_tests_failed; then
    exit 1
fi
