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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

create_project() {
    project_dir=$tmp_dir/$1

    mkdir -p "$project_dir/.coderail/tickets/open"
    mkdir -p "$project_dir/.coderail/tickets/active"
    mkdir -p "$project_dir/.coderail/tickets/closed"

    printf '%s\n' "$project_dir"
}

run_ticket() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_ticket_dispatches_loop() {
    work_dir=$(create_project loop-dispatch)

    run_ticket "$work_dir" loop -h

    assert_success
    assert_contains "$run_stdout" "cr ticket loop"
}

assert_ticket_help_marks_clean_deprecated() {
    work_dir=$tmp_dir/ticket-help
    mkdir "$work_dir"

    run_ticket "$work_dir" --help

    assert_success
    assert_contains "$run_stdout" "  clean                 Clean up tickets (deprecated; use cr clean)"
    assert_file_empty "$run_stderr"
}

print_tests_header "Ticket Command Tests"
test "Ticket dispatches loop command" assert_ticket_dispatches_loop
test "Ticket help marks clean deprecated" assert_ticket_help_marks_clean_deprecated

print_tests_summary

if some_tests_failed; then
    exit 1
fi
