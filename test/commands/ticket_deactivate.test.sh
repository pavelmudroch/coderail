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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-deactivate-test.XXXXXX")

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

run_deactivate() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket deactivate "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_deactivate_active_ticket() {
    work_dir=$(create_project success)
    active_file=$work_dir/.coderail/tickets/active/0007-work-ticket.md
    open_file=$work_dir/.coderail/tickets/open/0007-work-ticket.md

    write_ticket "$work_dir/.coderail/tickets/open/0012-parent-ticket.md" 0012 parent-ticket "Parent Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/closed/0013-other-ticket.md" 0013 other-ticket "Other Ticket" closed "" "close_reason: done
"
    write_ticket "$active_file" 0007 work-ticket "Work Ticket" active "0012" ""

    run_deactivate "$work_dir" 7 --depends-on 12 --depends-on other-ticket -d 0012

    assert_success
    assert_stdout_content ".coderail/tickets/open/0007-work-ticket.md"
    assert_file_empty "$run_stderr"
    assert_path_missing "$active_file"
    assert_file "$open_file"
    assert_contains "$open_file" "status: open"
    assert_contains "$open_file" "dependencies: 0012, 0013"
}

assert_deactivate_rejects_non_active_ticket() {
    work_dir=$(create_project non-active)
    open_file=$work_dir/.coderail/tickets/open/0008-open-ticket.md

    write_ticket "$open_file" 0008 open-ticket "Open Ticket" open "" ""

    run_deactivate "$work_dir" 8

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket must be active: .coderail/tickets/open/0008-open-ticket.md"
    assert_file "$open_file"
    assert_contains "$open_file" "status: open"
}

assert_deactivate_rejects_self_dependency() {
    work_dir=$(create_project self-dependency)
    active_file=$work_dir/.coderail/tickets/active/0009-self-ticket.md
    open_file=$work_dir/.coderail/tickets/open/0009-self-ticket.md

    write_ticket "$active_file" 0009 self-ticket "Self Ticket" active "" ""

    run_deactivate "$work_dir" 9 --depends-on 9

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket cannot depend on itself: 0009"
    assert_file "$active_file"
    assert_path_missing "$open_file"
    assert_contains "$active_file" "status: active"
}

print_tests_header "Ticket Deactivate Tests"
test "Deactivate active ticket" assert_deactivate_active_ticket
test "Deactivate rejects non-active ticket" assert_deactivate_rejects_non_active_ticket
test "Deactivate rejects self dependency" assert_deactivate_rejects_self_dependency

print_tests_summary

if some_tests_failed; then
    exit 1
fi
