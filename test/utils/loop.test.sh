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

assert_no_path() {
    [ ! -e "$1" ] && [ ! -L "$1" ] ||
        fail "unexpected path: $1"
}

assert_discovery_state() {
    content=$1
    expected_state=$2
    discovery_file=$tmp_dir/discovery-state.md

    printf '%s\n' "$content" > "$discovery_file"

    assert_equals "$(loop_discovery_state "$discovery_file")" "$expected_state"
}

assert_discovery_state_rejected() {
    content=$1
    discovery_file=$tmp_dir/discovery-state.md

    printf '%s\n' "$content" > "$discovery_file"

    set +e
    output=$(loop_discovery_state "$discovery_file")
    status=$?
    set -e

    [ "$status" -ne 0 ] ||
        fail "invalid discovery state was accepted"
    assert_equals "$output" ""
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
    printf '*\n!.gitignore\n' > "$project_dir/.coderail/loop/.gitignore"
    printf 'existing diagnostic\n' > "$project_dir/.coderail/loop/existing.txt"

    assert_equals "$(loop_setup "$project_dir")" false
    assert_file_content "$project_dir/.coderail/loop/.gitignore" "*
!.gitignore"
    assert_file_content \
        "$project_dir/.coderail/loop/existing.txt" \
        "existing diagnostic"
}

assert_loop_verify_ignore_policy_is_exact() {
    project_dir=$tmp_dir/verify-ignore

    mkdir -p "$project_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$project_dir/.coderail/loop/.gitignore"

    loop_verify_ignore_policy "$project_dir" ||
        fail "valid loop ignore policy was rejected"

    printf '*\n!.gitignore\n!exposed.txt\n' \
        > "$project_dir/.coderail/loop/.gitignore"

    if loop_verify_ignore_policy "$project_dir"; then
        fail "invalid loop ignore policy was accepted"
    fi

    rm "$project_dir/.coderail/loop/.gitignore"
    ln -s "$project_dir/outside-ignore" \
        "$project_dir/.coderail/loop/.gitignore"
    printf '*\n!.gitignore\n' > "$project_dir/outside-ignore"

    if loop_verify_ignore_policy "$project_dir"; then
        fail "symlink loop ignore policy was accepted"
    fi
}

assert_loop_remove_stays_within_loop_directory() {
    project_dir=$tmp_dir/remove
    outside_dir=$tmp_dir/remove-outside

    mkdir -p "$project_dir/.coderail/loop" "$outside_dir"
    printf '*\n!.gitignore\n' > "$project_dir/.coderail/loop/.gitignore"
    printf 'diagnostic\n' > "$project_dir/.coderail/loop/diagnostic.txt"
    printf 'protected ignore\n' > "$project_dir/.coderail/.gitignore"
    printf 'protected keep\n' > "$project_dir/.coderail/.gitkeep"
    printf 'outside\n' > "$outside_dir/diagnostic.txt"
    ln -s "$outside_dir" "$project_dir/.coderail/loop/outside"

    loop_remove "$project_dir" ||
        fail "loop removal failed"

    assert_no_path "$project_dir/.coderail/loop"
    assert_file_content \
        "$project_dir/.coderail/.gitignore" \
        "protected ignore"
    assert_file_content \
        "$project_dir/.coderail/.gitkeep" \
        "protected keep"
    assert_file_content "$outside_dir/diagnostic.txt" "outside"
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

assert_loop_discovery_state_recognizes_strict_markers() {
    assert_discovery_state "---
resolved: true
---" resolved
    assert_discovery_state "---
resolved: false
---" unresolved
}

assert_loop_discovery_state_accepts_other_frontmatter() {
    assert_discovery_state "---
ticket: 0002
resolved: false
source: implementation
---" unresolved
}

assert_loop_discovery_state_rejects_invalid_markers() {
    assert_discovery_state_rejected "---
ticket: 0002
---"
    assert_discovery_state_rejected "---
resolved: false
resolved: true
---"
    assert_discovery_state_rejected "---
resolved: \"true\"
---"
    assert_discovery_state_rejected "---
resolved: false # pending
---"
    assert_discovery_state_rejected "---
resolved: yes
---"
}

assert_loop_discovery_state_rejects_markers_outside_first_frontmatter() {
    assert_discovery_state_rejected "---
ticket: 0002
---
resolved: true"
}

print_tests_header "Loop Utils Tests"
test "Loop setup creates and reports new ignore" assert_loop_setup_creates_ignore
test "Loop setup preserves existing ignore" assert_loop_setup_preserves_existing_ignore
test "Loop setup fails for regular loop file" assert_loop_setup_fails_for_regular_loop_file
test "Loop verifies the exact ignore policy" assert_loop_verify_ignore_policy_is_exact
test "Loop removal stays within the loop directory" assert_loop_remove_stays_within_loop_directory
test "Loop discovery state recognizes strict markers" assert_loop_discovery_state_recognizes_strict_markers
test "Loop discovery state accepts other frontmatter" assert_loop_discovery_state_accepts_other_frontmatter
test "Loop discovery state rejects invalid markers" assert_loop_discovery_state_rejects_invalid_markers
test "Loop discovery state rejects markers outside first frontmatter" assert_loop_discovery_state_rejects_markers_outside_first_frontmatter
print_tests_summary

if some_tests_failed; then
    exit 1
fi
