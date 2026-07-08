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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-close-test.XXXXXX")

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

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {
    ! grep -F "$2" "$1" >/dev/null || fail "$1 contains: $2"
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

    mkdir -p "$project_dir/.coderail/tickets"

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

    mkdir -p "$(dirname "$ticket_file")"
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

run_close() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket close "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_close() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" --verbose ticket close "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_close_active_ticket() {
    work_dir=$(create_project success)
    active_file=$work_dir/.coderail/tickets/active/0001-active-ticket.md
    closed_file=$work_dir/.coderail/tickets/closed/0001-active-ticket.md

    write_ticket "$active_file" 0001 active-ticket "Active Ticket" active "" ""

    run_close "$work_dir" 1

    assert_success
    assert_stdout_content ".coderail/tickets/closed/0001-active-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$active_file"
    assert_file "$closed_file"
    assert_contains "$closed_file" "status: closed"
    assert_contains "$closed_file" "close_reason: done"
    assert_not_contains "$closed_file" "duplicate_of:"
}

assert_close_rejects_non_active_ticket() {
    work_dir=$(create_project non-active)
    open_file=$work_dir/.coderail/tickets/open/0002-open-ticket.md

    write_ticket "$open_file" 0002 open-ticket "Open Ticket" open "" ""

    run_close "$work_dir" 2

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket must be active: .coderail/tickets/open/0002-open-ticket.md"
    assert_file "$open_file"
}

assert_done_requires_satisfied_dependencies() {
    work_dir=$(create_project unsatisfied-dependency)
    active_file=$work_dir/.coderail/tickets/active/0003-blocked-ticket.md

    write_ticket \
        "$work_dir/.coderail/tickets/closed/0001-done-ticket.md" \
        0001 \
        done-ticket \
        "Done Ticket" \
        closed \
        "" \
        "close_reason: done
"
    write_ticket "$work_dir/.coderail/tickets/open/0002-open-ticket.md" 0002 open-ticket "Open Ticket" open "" ""
    write_ticket "$active_file" 0003 blocked-ticket "Blocked Ticket" active "0001, 0002" ""

    run_close "$work_dir" 3

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: dependency is not satisfied: 0002"
    assert_file "$active_file"
}

assert_done_accepts_recursive_duplicate_dependency() {
    work_dir=$(create_project duplicate-dependency)
    active_file=$work_dir/.coderail/tickets/active/0005-dependent-ticket.md
    closed_file=$work_dir/.coderail/tickets/closed/0005-dependent-ticket.md

    write_ticket "$work_dir/.coderail/tickets/open/0004-open-ticket.md" 0004 open-ticket "Open Ticket" open "" ""
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0001-done-ticket.md" \
        0001 \
        done-ticket \
        "Done Ticket" \
        closed \
        "0004" \
        "close_reason: done
"
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0002-duplicate-ticket.md" \
        0002 \
        duplicate-ticket \
        "Duplicate Ticket" \
        closed \
        "" \
        "close_reason: duplicate
duplicate_of: 0001
"
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0003-second-duplicate.md" \
        0003 \
        second-duplicate \
        "Second Duplicate" \
        closed \
        "" \
        "close_reason: duplicate
duplicate_of: 0002
"
    write_ticket "$active_file" 0005 dependent-ticket "Dependent Ticket" active "0003" ""

    run_close "$work_dir" 5

    assert_success
    assert_stdout_content ".coderail/tickets/closed/0005-dependent-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$active_file"
    assert_file "$closed_file"
}

assert_duplicate_close_requires_duplicate_of() {
    work_dir=$(create_project missing-duplicate-of)
    active_file=$work_dir/.coderail/tickets/active/0006-duplicate-ticket.md

    write_ticket "$active_file" 0006 duplicate-ticket "Duplicate Ticket" active "" ""

    run_close "$work_dir" --reason duplicate 6

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: --duplicate-of is required when --reason is duplicate"
    assert_file "$active_file"
}

assert_duplicate_close_writes_duplicate_of() {
    work_dir=$(create_project duplicate)
    active_file=$work_dir/.coderail/tickets/active/0007-duplicate-ticket.md
    closed_file=$work_dir/.coderail/tickets/closed/0007-duplicate-ticket.md

    write_ticket "$work_dir/.coderail/tickets/open/0001-original-ticket.md" 0001 original-ticket "Original Ticket" open "" ""
    write_ticket "$active_file" 0007 duplicate-ticket "Duplicate Ticket" active "" ""

    run_close "$work_dir" --reason duplicate --duplicate-of 1 7

    assert_success
    assert_stdout_content ".coderail/tickets/closed/0007-duplicate-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$active_file"
    assert_file "$closed_file"
    assert_contains "$closed_file" "close_reason: duplicate"
    assert_contains "$closed_file" "duplicate_of: 0001"
}

assert_missing_ticket_directory_suggests_init() {
    work_dir=$tmp_dir/missing-tickets

    mkdir "$work_dir"

    run_close "$work_dir" 1

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket directory not found: .coderail/tickets; run cr init before proceeding"
}

assert_close_logs_notices() {
    work_dir=$(create_project verbose)
    active_file=$work_dir/.coderail/tickets/active/0008-verbose-ticket.md

    write_ticket "$active_file" 0008 verbose-ticket "Verbose Ticket" active "" ""

    run_verbose_close "$work_dir" 8

    assert_success
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" "locating ticket: 8"
    assert_contains "$run_stdout" "validating ticket: .coderail/tickets/active/0008-verbose-ticket.md"
    assert_contains "$run_stdout" "verifying active ticket: .coderail/tickets/active/0008-verbose-ticket.md"
    assert_contains "$run_stdout" "closing ticket as done: .coderail/tickets/active/0008-verbose-ticket.md"
    assert_contains "$run_stdout" "closed ticket: .coderail/tickets/closed/0008-verbose-ticket.md"
    assert_contains "$run_stdout" ".coderail/tickets/closed/0008-verbose-ticket.md"
}

print_tests_header "Ticket Close Tests"
test "Close active ticket" assert_close_active_ticket
test "Close rejects non-active ticket" assert_close_rejects_non_active_ticket
test "Done close requires satisfied dependencies" assert_done_requires_satisfied_dependencies
test "Done close accepts recursive duplicate dependency" assert_done_accepts_recursive_duplicate_dependency
test "Duplicate close requires duplicate_of" assert_duplicate_close_requires_duplicate_of
test "Duplicate close writes duplicate_of" assert_duplicate_close_writes_duplicate_of
test "Missing ticket directory suggests init" assert_missing_ticket_directory_suggests_init
test "Close logs notices" assert_close_logs_notices

print_tests_summary

if some_tests_failed; then
    exit 1
fi
