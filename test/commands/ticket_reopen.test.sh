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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-reopen-test.XXXXXX")

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

run_reopen() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket reopen "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_reopen_closed_ticket() {
    work_dir=$(create_project success)
    closed_file=$work_dir/.coderail/tickets/closed/0010-closed-ticket.md
    open_file=$work_dir/.coderail/tickets/open/0010-closed-ticket.md

    write_ticket "$work_dir/.coderail/tickets/open/0001-parent-ticket.md" 0001 parent-ticket "Parent Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/active/0002-active-parent.md" 0002 active-parent "Active Parent" active "" ""
    write_ticket "$closed_file" 0010 closed-ticket "Closed Ticket" closed "0001" "close_reason: duplicate
duplicate_of: 0001
"

    run_reopen "$work_dir" 10 --depends-on active-parent --depends-on 0001

    assert_success
    assert_stdout_content ".coderail/tickets/open/0010-closed-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$closed_file"
    assert_file "$open_file"
    assert_contains "$open_file" "status: open"
    assert_contains "$open_file" "dependencies: 0001, 0002"
    assert_not_contains "$open_file" "close_reason:"
    assert_not_contains "$open_file" "duplicate_of:"
}

assert_reopen_rejects_non_closed_ticket() {
    work_dir=$(create_project non-closed)
    active_file=$work_dir/.coderail/tickets/active/0011-active-ticket.md

    write_ticket "$active_file" 0011 active-ticket "Active Ticket" active "" ""

    run_reopen "$work_dir" 11

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket must be closed: .coderail/tickets/active/0011-active-ticket.md"
    assert_file "$active_file"
    assert_contains "$active_file" "status: active"
}

assert_reopen_missing_dependency_does_not_mutate() {
    work_dir=$(create_project missing-dependency)
    closed_file=$work_dir/.coderail/tickets/closed/0012-missing-dependency.md
    open_file=$work_dir/.coderail/tickets/open/0012-missing-dependency.md

    write_ticket "$closed_file" 0012 missing-dependency "Missing Dependency" closed "" "close_reason: done
"

    run_reopen "$work_dir" 12 --depends-on missing-ticket

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket reference not found: missing-ticket"
    assert_file "$closed_file"
    assert_path_missing "$open_file"
    assert_contains "$closed_file" "status: closed"
    assert_contains "$closed_file" "close_reason: done"
}

print_tests_header "Ticket Reopen Tests"
test "Reopen closed ticket" assert_reopen_closed_ticket
test "Reopen rejects non-closed ticket" assert_reopen_rejects_non_closed_ticket
test "Reopen missing dependency does not mutate" assert_reopen_missing_dependency_does_not_mutate

print_tests_summary

if some_tests_failed; then
    exit 1
fi
