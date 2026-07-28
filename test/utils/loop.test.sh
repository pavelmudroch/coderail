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

assert_loop_ensure_outer_ignore_creates_ignore() {
    project_dir=$tmp_dir/create

    mkdir "$project_dir"

    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
    assert_file_content "$project_dir/.coderail/.gitignore" "loop"
    assert_no_path "$project_dir/.coderail/loop"
    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" false
}

assert_loop_ensure_outer_ignore_preserves_existing_content() {
    project_dir=$tmp_dir/existing

    mkdir -p "$project_dir/.coderail/loop"
    printf 'existing ignore\n' > "$project_dir/.coderail/.gitignore"
    printf 'legacy ignore\n' > "$project_dir/.coderail/loop/.gitignore"

    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
    assert_file_content \
        "$project_dir/.coderail/.gitignore" \
        "existing ignore
loop"
    assert_file_content \
        "$project_dir/.coderail/loop/.gitignore" \
        "legacy ignore"
}

assert_loop_ensure_outer_ignore_accepts_exact_rules() {
    project_dir=$tmp_dir/verify-ignore

    mkdir -p "$project_dir/.coderail"
    printf 'loop\n' > "$project_dir/.coderail/.gitignore"

    loop_verify_ignore_policy "$project_dir" ||
        fail "exact loop rule was rejected"
    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" false

    printf 'loop/\n' > "$project_dir/.coderail/.gitignore"

    loop_verify_ignore_policy "$project_dir" ||
        fail "exact loop/ rule was rejected"
    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" false
}

assert_loop_ensure_outer_ignore_appends_after_inactive_rules() {
    project_dir=$tmp_dir/inactive-rules

    mkdir -p "$project_dir/.coderail"

    for inactive_rule in '# loop' '!loop' '*/loop' 'loop/*'; do
        printf '%s\n' "$inactive_rule" > "$project_dir/.coderail/.gitignore"

        assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
        assert_file_content \
            "$project_dir/.coderail/.gitignore" \
            "$inactive_rule
loop"
    done
}

assert_loop_ensure_outer_ignore_appends_after_later_negation() {
    project_dir=$tmp_dir/later-negation

    mkdir -p "$project_dir/.coderail"
    git -C "$project_dir" init -q
    printf 'loop\n!loop\n' > "$project_dir/.coderail/.gitignore"

    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
    assert_file_content \
        "$project_dir/.coderail/.gitignore" \
        "loop
!loop
loop"
    git -C "$project_dir" check-ignore -q -- .coderail/loop/transcript.txt ||
        fail "loop transcript is not ignored"
}

assert_loop_ensure_outer_ignore_appends_after_later_negation_without_git() {
    project_dir=$tmp_dir/later-negation-without-git

    mkdir -p "$project_dir/.coderail"

    for ignored_rule in loop 'loop/'; do
        printf '%s\n!%s\n' "$ignored_rule" "$ignored_rule" \
            > "$project_dir/.coderail/.gitignore"

        assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
        assert_file_content \
            "$project_dir/.coderail/.gitignore" \
            "$ignored_rule
!$ignored_rule
loop"
    done
}

assert_loop_ensure_outer_ignore_appends_after_trailing_whitespace_negation_without_git() {
    project_dir=$tmp_dir/trailing-whitespace-negation-without-git

    mkdir -p "$project_dir/.coderail"
    printf 'loop\n!loop \n' > "$project_dir/.coderail/.gitignore"

    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" true
    assert_file_content \
        "$project_dir/.coderail/.gitignore" \
        "$(printf 'loop\n!loop \nloop')"
}

assert_loop_ensure_outer_ignore_accepts_escaped_trailing_whitespace_negation_without_git() {
    project_dir=$tmp_dir/escaped-trailing-whitespace-negation-without-git

    mkdir -p "$project_dir/.coderail"
    printf 'loop\n!loop\\ \n' > "$project_dir/.coderail/.gitignore"

    assert_equals "$(loop_ensure_outer_ignore "$project_dir")" false
    assert_file_content \
        "$project_dir/.coderail/.gitignore" \
        "loop
!loop\\ "
}

assert_loop_create_directory_is_lazy() {
    project_dir=$tmp_dir/create-directory

    mkdir "$project_dir"

    loop_ensure_outer_ignore "$project_dir" >/dev/null ||
        fail "failed to create outer ignore"
    assert_no_path "$project_dir/.coderail/loop"

    loop_create_directory "$project_dir" ||
        fail "failed to create loop directory"

    [ -d "$project_dir/.coderail/loop" ] ||
        fail "loop directory was not created"
}

assert_loop_remove_stays_within_loop_directory() {
    project_dir=$tmp_dir/remove
    outside_dir=$tmp_dir/remove-outside

    mkdir -p "$project_dir/.coderail/loop" "$outside_dir"
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

    loop_remove "$project_dir" ||
        fail "removal was not a no-op for an absent loop directory"
}

assert_loop_create_directory_fails_for_regular_loop_file() {
    project_dir=$tmp_dir/regular-loop-file

    mkdir -p "$project_dir/.coderail"
    : > "$project_dir/.coderail/loop"

    set +e
    output=$(loop_create_directory "$project_dir")
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
test "Loop ensures a new outer ignore without creating loop" assert_loop_ensure_outer_ignore_creates_ignore
test "Loop ensure preserves existing outer and legacy ignore content" assert_loop_ensure_outer_ignore_preserves_existing_content
test "Loop ensure accepts exact outer ignore rules" assert_loop_ensure_outer_ignore_accepts_exact_rules
test "Loop ensure appends after inactive outer rules" assert_loop_ensure_outer_ignore_appends_after_inactive_rules
test "Loop ensure appends after a later outer-rule negation" assert_loop_ensure_outer_ignore_appends_after_later_negation
test "Loop ensure appends after a later outer-rule negation without Git" assert_loop_ensure_outer_ignore_appends_after_later_negation_without_git
test "Loop ensure appends after a trailing-whitespace outer-rule negation without Git" assert_loop_ensure_outer_ignore_appends_after_trailing_whitespace_negation_without_git
test "Loop ensure accepts an escaped trailing-whitespace outer-rule negation without Git" assert_loop_ensure_outer_ignore_accepts_escaped_trailing_whitespace_negation_without_git
test "Loop directory creation is lazy" assert_loop_create_directory_is_lazy
test "Loop directory creation fails for a regular loop file" assert_loop_create_directory_fails_for_regular_loop_file
test "Loop removal stays within the loop directory" assert_loop_remove_stays_within_loop_directory
test "Loop discovery state recognizes strict markers" assert_loop_discovery_state_recognizes_strict_markers
test "Loop discovery state accepts other frontmatter" assert_loop_discovery_state_accepts_other_frontmatter
test "Loop discovery state rejects invalid markers" assert_loop_discovery_state_rejects_invalid_markers
test "Loop discovery state rejects markers outside first frontmatter" assert_loop_discovery_state_rejects_markers_outside_first_frontmatter
print_tests_summary

if some_tests_failed; then
    exit 1
fi
