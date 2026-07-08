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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-activate-test.XXXXXX")

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
    ticket_extra=$6

    write_ticket_with_dependencies "$ticket_file" \
        "$ticket_id" \
        "$ticket_slug" \
        "$ticket_title" \
        "$ticket_status" \
        "" \
        "$ticket_extra"
}

write_ticket_with_dependencies() {
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

write_invalid_ticket() {
    ticket_file=$1

    cat > "$ticket_file" <<'EOF'
---
id: 0002
slug: invalid-ticket
status: open
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies:
---

# Invalid Ticket
EOF
}

run_activate() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket activate "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_activate() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" --verbose ticket activate "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_activate_open_ticket() {
    work_dir=$(create_project success)
    open_file=$work_dir/.coderail/tickets/open/0001-first-ticket.md
    active_file=$work_dir/.coderail/tickets/active/0001-first-ticket.md

    write_ticket "$open_file" 0001 first-ticket "First Ticket" open ""

    run_activate "$work_dir" 1

    assert_success
    assert_stdout_content ".coderail/tickets/active/0001-first-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$open_file"
    assert_file "$active_file"
    assert_contains "$active_file" "status: active"
}

assert_activate_logs_notices() {
    work_dir=$(create_project verbose)
    open_file=$work_dir/.coderail/tickets/open/0003-verbose-ticket.md

    write_ticket "$open_file" 0003 verbose-ticket "Verbose Ticket" open ""

    run_verbose_activate "$work_dir" 3

    assert_success
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" "locating ticket: 3"
    assert_contains "$run_stdout" "validating ticket: .coderail/tickets/open/0003-verbose-ticket.md"
    assert_contains "$run_stdout" "verified open ticket: .coderail/tickets/open/0003-verbose-ticket.md"
    assert_contains "$run_stdout" "moving ticket to active: .coderail/tickets/open/0003-verbose-ticket.md"
    assert_contains "$run_stdout" "activated ticket: .coderail/tickets/active/0003-verbose-ticket.md"
    assert_contains "$run_stdout" ".coderail/tickets/active/0003-verbose-ticket.md"
}

assert_invalid_ticket_is_not_moved() {
    work_dir=$(create_project invalid)
    open_file=$work_dir/.coderail/tickets/open/0002-invalid-ticket.md
    active_file=$work_dir/.coderail/tickets/active/0002-invalid-ticket.md

    write_invalid_ticket "$open_file"

    run_activate "$work_dir" 2

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: missing ticket field: title"
    assert_file "$open_file"
    assert_path_missing "$active_file"
}

assert_non_open_ticket_is_rejected() {
    work_dir=$(create_project active)
    active_file=$work_dir/.coderail/tickets/active/0004-active-ticket.md

    write_ticket "$active_file" 0004 active-ticket "Active Ticket" active ""

    run_activate "$work_dir" 4

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket must be open: .coderail/tickets/active/0004-active-ticket.md"
    assert_file "$active_file"
    assert_contains "$active_file" "status: active"
}

assert_unsatisfied_dependency_is_rejected() {
    work_dir=$(create_project unsatisfied-dependency)
    dependency_file=$work_dir/.coderail/tickets/open/0005-blocking-ticket.md
    open_file=$work_dir/.coderail/tickets/open/0006-dependent-ticket.md
    active_file=$work_dir/.coderail/tickets/active/0006-dependent-ticket.md

    write_ticket "$dependency_file" 0005 blocking-ticket "Blocking Ticket" open ""
    write_ticket_with_dependencies \
        "$open_file" \
        0006 \
        dependent-ticket \
        "Dependent Ticket" \
        open \
        "0005" \
        ""

    run_activate "$work_dir" 6

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: dependency is not satisfied: 0005"
    assert_file "$open_file"
    assert_path_missing "$active_file"
}

assert_satisfied_duplicate_dependency_is_activated() {
    work_dir=$(create_project duplicate-dependency)
    done_file=$work_dir/.coderail/tickets/closed/0007-done-ticket.md
    duplicate_file=$work_dir/.coderail/tickets/closed/0008-duplicate-ticket.md
    open_file=$work_dir/.coderail/tickets/open/0009-dependent-ticket.md
    active_file=$work_dir/.coderail/tickets/active/0009-dependent-ticket.md

    write_ticket "$done_file" 0007 done-ticket "Done Ticket" closed "close_reason: done
"
    write_ticket "$duplicate_file" 0008 duplicate-ticket "Duplicate Ticket" closed "close_reason: duplicate
duplicate_of: 0007
"
    write_ticket_with_dependencies \
        "$open_file" \
        0009 \
        dependent-ticket \
        "Dependent Ticket" \
        open \
        "0008" \
        ""

    run_activate "$work_dir" 9

    assert_success
    assert_stdout_content ".coderail/tickets/active/0009-dependent-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$open_file"
    assert_file "$active_file"
    assert_contains "$active_file" "status: active"
}

print_tests_header "Ticket Activate Tests"
test "Activate open ticket" assert_activate_open_ticket
test "Activate logs notices" assert_activate_logs_notices
test "Invalid ticket is not moved" assert_invalid_ticket_is_not_moved
test "Non-open ticket is rejected" assert_non_open_ticket_is_rejected
test "Unsatisfied dependency is rejected" assert_unsatisfied_dependency_is_rejected
test "Satisfied duplicate dependency is activated" assert_satisfied_duplicate_dependency_is_activated

print_tests_summary

if some_tests_failed; then
    exit 1
fi
