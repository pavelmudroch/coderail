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

assert_file_contains() {
    grep -F -- "$2" "$1" >/dev/null ||
        fail "$1 does not contain: $2"
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
    assert_file_content "$work_dir/.coderail/loop/.gitignore" "*
!.gitignore"
    assert_file_content "$work_dir/.coderail/config.ini" "# characters after '#' are comments
# default_tool = codex # set the default tool for cr"
    assert_file_content "$work_dir/.coderail/test.map" "# first '#' starts a Coderail comment, even inside quoted shell text

[default]
# Add path-independent commands that always run

# Use captures in section patterns for commands that need selected path
# [{path:**}]
# shellcheck {path}"
}

assert_init_preserves_existing_loop_ignore() {
    work_dir=$tmp_dir/existing-loop-ignore

    mkdir -p "$work_dir/.coderail/loop"
    printf 'user ignore\n' > "$work_dir/.coderail/loop/.gitignore"

    assert_init_succeeds "$work_dir"

    assert_file_content "$work_dir/.coderail/loop/.gitignore" "user ignore"
}

assert_init_preserves_existing_files() {
    work_dir=$tmp_dir/existing-files

    mkdir -p "$work_dir/.coderail"
    printf 'default_tool = codex\n' > "$work_dir/.coderail/config.ini"
    printf 'project file\n' > "$work_dir/project.txt"

    assert_init_succeeds "$work_dir"

    assert_file_content "$work_dir/.coderail/config.ini" "default_tool = codex"
    assert_file_content "$work_dir/project.txt" "project file"
    assert_empty_dir "$work_dir/.coderail/tickets"
    assert_file_content "$work_dir/.coderail/test.map" "# first '#' starts a Coderail comment, even inside quoted shell text

[default]
# Add path-independent commands that always run

# Use captures in section patterns for commands that need selected path
# [{path:**}]
# shellcheck {path}"
}

assert_init_preserves_legacy_config() {
    work_dir=$tmp_dir/legacy-config

    mkdir -p "$work_dir/.coderail"
    printf 'default_tool = codex\n' > "$work_dir/.coderail/conf.ini"

    assert_init_succeeds "$work_dir"

    assert_file_content "$work_dir/.coderail/conf.ini" "default_tool = codex"
    assert_file_content "$work_dir/.coderail/config.ini" "# characters after '#' are comments
# default_tool = codex # set the default tool for cr"
}

assert_readme_documents_repository_config_migration() {
    readme=$SCRIPT_DIR/../../README.md

    assert_file_contains "$readme" '### `.coderail/config.ini`'
    assert_file_contains "$readme" '`.coderail/conf.ini` is a deprecated fallback'
    assert_file_contains "$readme" 'rename it to `config.ini`'
    assert_file_contains "$readme" '`config.ini` takes precedence over `conf.ini`'
    assert_file_contains "$readme" '`default_tool`'
    assert_file_contains "$readme" '`auto_review`'
    assert_file_contains "$readme" '`codex`, `claude`, `copilot`, or `gemini`'
    assert_file_contains "$readme" '`true` or `false`'
    assert_file_contains "$readme" '`--auto-review`'
    assert_file_contains "$readme" '`--no-auto-review`'
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
test "Init preserves legacy config" assert_init_preserves_legacy_config
test "Init preserves existing loop ignore" assert_init_preserves_existing_loop_ignore
test "Init without write permission fails" assert_init_without_write_permission_fails
test "Init target file fails" assert_init_target_file_fails
test "README documents repository config migration" assert_readme_documents_repository_config_migration

print_tests_summary

if some_tests_failed; then
    exit 1
fi
