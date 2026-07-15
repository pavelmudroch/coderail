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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-create-test.XXXXXX")

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

assert_dir() {
    [ -d "$1" ] || fail "missing directory: $1"
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

    mkdir -p "$(dirname "$ticket_file")"
    cat > "$ticket_file" <<EOF
---
id: $ticket_id
slug: $ticket_slug
title: $ticket_title
status: $ticket_status
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies:
---

# $ticket_title
EOF
}

run_create() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket create "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_create_ticket() {
    work_dir=$(create_project success)

    write_ticket \
        "$work_dir/.coderail/tickets/open/0001-existing-ticket.md" \
        0001 \
        existing-ticket \
        "Existing Ticket" \
        open
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0009-closed-ticket.md" \
        0009 \
        closed-ticket \
        "Closed Ticket" \
        closed

    run_create "$work_dir" "New Ticket"

    ticket_file=$work_dir/.coderail/tickets/open/0010-new-ticket.md

    assert_success
    assert_stdout_content ".coderail/tickets/open/0010-new-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$ticket_file"
    assert_contains "$ticket_file" "id: 0010"
    assert_contains "$ticket_file" "slug: new-ticket"
    assert_contains "$ticket_file" "title: New Ticket"
    assert_contains "$ticket_file" "status: open"
    assert_contains "$ticket_file" "dependencies:"
    assert_contains "$ticket_file" "# New Ticket"
}

assert_create_ticket_with_dependencies() {
    work_dir=$(create_project dependencies)

    write_ticket \
        "$work_dir/.coderail/tickets/open/0001-first-ticket.md" \
        0001 \
        first-ticket \
        "First Ticket" \
        open
    write_ticket \
        "$work_dir/.coderail/tickets/active/0002-second-ticket.md" \
        0002 \
        second-ticket \
        "Second Ticket" \
        active

    run_create "$work_dir" --depends-on 1 --depends-on second-ticket -d 0001 "Blocked Ticket"

    ticket_file=$work_dir/.coderail/tickets/open/0003-blocked-ticket.md

    assert_success
    assert_stdout_content ".coderail/tickets/open/0003-blocked-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$ticket_file"
    assert_contains "$ticket_file" "dependencies: 0001, 0002"
}

assert_create_without_write_permission_fails() {
    work_dir=$(create_project no-write)

    mkdir -p "$work_dir/.coderail/tickets/open"
    chmod a-w "$work_dir/.coderail/tickets/open"

    run_create "$work_dir" "Cannot Write"

    chmod u+w "$work_dir/.coderail/tickets/open"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_path_missing "$work_dir/.coderail/tickets/open/0001-cannot-write.md"
}

assert_create_ticket_without_tickets_directory() {
    work_dir=$tmp_dir/missing-tickets

    mkdir -p "$work_dir/.coderail"

    run_create "$work_dir" "Missing Tickets"

    ticket_file=$work_dir/.coderail/tickets/open/0001-missing-tickets.md

    assert_success
    assert_stdout_content ".coderail/tickets/open/0001-missing-tickets.md"
    assert_file_empty "$run_stderr"
    assert_dir "$work_dir/.coderail/tickets"
    assert_file "$ticket_file"
}

assert_missing_coderail_directory_suggests_init() {
    work_dir=$tmp_dir/missing-coderail

    mkdir "$work_dir"

    run_create "$work_dir" "Missing Coderail"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: coderail directory not found: .coderail; run cr init before proceeding"
    assert_path_missing "$work_dir/.coderail"
}

print_tests_header "Ticket Create Tests"
test "Create ticket" assert_create_ticket
test "Create ticket with dependencies" assert_create_ticket_with_dependencies
test "Create without write permission fails" assert_create_without_write_permission_fails
test "Create ticket without tickets directory" assert_create_ticket_without_tickets_directory
test "Missing coderail directory suggests init" assert_missing_coderail_directory_suggests_init

print_tests_summary

if some_tests_failed; then
    exit 1
fi
