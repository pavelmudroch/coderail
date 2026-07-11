#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../../.."
    pwd
)

CR=$ROOT_DIR/bin/cr
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-next-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
    chmod -R u+rwX "$tmp_dir" 2>/dev/null || :
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_file_content() {
    file=$1
    expected=$2
    expected_file=$tmp_dir/expected-content

    assert_file "$file"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$file" >/dev/null || fail "$file content differs"
}

assert_stdout_content() {
    assert_file_content "$run_stdout" "$1"
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

create_project() {
    project_dir=$tmp_dir/$1

    mkdir -p "$project_dir/.coderail/tickets/open"
    mkdir -p "$project_dir/.coderail/tickets/active"
    mkdir -p "$project_dir/.coderail/tickets/closed"

    printf '%s\n' "$project_dir"
}

write_ticket() {
    ticket_file=$1
    ticket_id=$2
    ticket_slug=$3
    ticket_title=$4
    ticket_status=$5
    ticket_dependencies=$6
    ticket_extra=$7

    cat > "$ticket_file" <<EOF
---
id: $ticket_id
slug: $ticket_slug
title: $ticket_title
status: $ticket_status
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies: $ticket_dependencies
$ticket_extra---

# $ticket_title
EOF
}

run_next() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket next "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_next_requires_ticket_directory() {
    work_dir=$tmp_dir/missing-directory
    mkdir -p "$work_dir"

    run_next "$work_dir"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket directory not found: .coderail/tickets; run cr init before proceeding"
}

assert_next_reports_no_available_tickets() {
    work_dir=$(create_project none)

    run_next "$work_dir"

    assert_failure
    assert_stdout_content "no available tickets"
    assert_file_empty "$run_stderr"
}

assert_next_lists_open_tickets_without_dependencies() {
    work_dir=$(create_project no-dependencies)
    ready_file=$work_dir/.coderail/tickets/open/0001-ready-ticket.md

    write_ticket "$ready_file" 0001 ready-ticket "Ready Ticket" open "" ""

    run_next "$work_dir"

    assert_success
    assert_stdout_content ".coderail/tickets/open/0001-ready-ticket.md"
    assert_file_empty "$run_stderr"
}

assert_next_filters_by_satisfied_dependencies() {
    work_dir=$(create_project dependencies)
    done_file=$work_dir/.coderail/tickets/closed/0001-done-ticket.md
    duplicate_file=$work_dir/.coderail/tickets/closed/0002-duplicate-ticket.md
    dismissed_file=$work_dir/.coderail/tickets/closed/0003-dismissed-ticket.md
    ready_file=$work_dir/.coderail/tickets/open/0010-ready-ticket.md
    blocked_file=$work_dir/.coderail/tickets/open/0011-blocked-ticket.md

    write_ticket "$done_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$duplicate_file" 0002 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"
    write_ticket "$dismissed_file" 0003 dismissed-ticket "Dismissed Ticket" closed "" "close_reason: dismissed
"
    write_ticket "$ready_file" 0010 ready-ticket "Ready Ticket" open "0001, 0002" ""
    write_ticket "$blocked_file" 0011 blocked-ticket "Blocked Ticket" open "0003" ""

    run_next "$work_dir"

    assert_success
    assert_stdout_content ".coderail/tickets/open/0010-ready-ticket.md"
    assert_file_empty "$run_stderr"
}

assert_next_respects_limit() {
    work_dir=$(create_project limit)
    first_file=$work_dir/.coderail/tickets/open/0001-first-ticket.md
    second_file=$work_dir/.coderail/tickets/open/0002-second-ticket.md

    write_ticket "$first_file" 0001 first-ticket "First Ticket" open "" ""
    write_ticket "$second_file" 0002 second-ticket "Second Ticket" open "" ""

    run_next "$work_dir" --limit 1

    assert_success
    assert_stdout_content ".coderail/tickets/open/0001-first-ticket.md"
    assert_file_empty "$run_stderr"
}

assert_next_fails_on_missing_dependency() {
    work_dir=$(create_project missing-dependency)
    blocked_file=$work_dir/.coderail/tickets/open/0001-blocked-ticket.md

    write_ticket "$blocked_file" 0001 blocked-ticket "Blocked Ticket" open "9999" ""

    run_next "$work_dir"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket reference not found: 9999"
}

print_tests_header "Ticket Next Tests"
test "Next requires ticket directory" assert_next_requires_ticket_directory
test "Next reports no available tickets" assert_next_reports_no_available_tickets
test "Next lists open tickets without dependencies" assert_next_lists_open_tickets_without_dependencies
test "Next filters by satisfied dependencies" assert_next_filters_by_satisfied_dependencies
test "Next respects limit" assert_next_respects_limit
test "Next fails on missing dependency" assert_next_fails_on_missing_dependency

print_tests_summary

if some_tests_failed; then
    exit 1
fi
