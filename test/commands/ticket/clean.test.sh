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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-clean-test.XXXXXX")

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

run_clean() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket clean "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_clean_with_input() {
    work_dir=$1
    input=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    printf '%s' "$input" |
        "$CR" --cwd "$work_dir" ticket clean "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_clean_removes_satisfied_closed_tickets() {
    work_dir=$(create_project normal)
    open_file=$work_dir/.coderail/tickets/open/0010-open-ticket.md
    done_file=$work_dir/.coderail/tickets/closed/0001-done-ticket.md
    duplicate_done_file=$work_dir/.coderail/tickets/closed/0002-duplicate-done.md
    dismissed_file=$work_dir/.coderail/tickets/closed/0003-dismissed-ticket.md
    duplicate_dismissed_file=$work_dir/.coderail/tickets/closed/0004-duplicate-dismissed.md

    write_ticket "$done_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$duplicate_done_file" 0002 duplicate-done "Duplicate Done" closed "" "close_reason: duplicate
duplicate_of: 0001
"
    write_ticket "$dismissed_file" 0003 dismissed-ticket "Dismissed Ticket" closed "" "close_reason: dismissed
"
    write_ticket "$duplicate_dismissed_file" 0004 duplicate-dismissed "Duplicate Dismissed" closed "" "close_reason: duplicate
duplicate_of: 0003
"
    write_ticket "$open_file" 0010 open-ticket "Open Ticket" open "0001, 0002, 0003, 0004" ""

    run_clean "$work_dir"

    assert_success
    assert_stdout_content "update .coderail/tickets/open/0010-open-ticket.md
remove .coderail/tickets/closed/0001-done-ticket.md
remove .coderail/tickets/closed/0002-duplicate-done.md"
    assert_file_empty "$run_stderr"
    assert_file "$open_file"
    assert_path_missing "$done_file"
    assert_path_missing "$duplicate_done_file"
    assert_file "$dismissed_file"
    assert_file "$duplicate_dismissed_file"
    assert_contains "$open_file" "dependencies: 0003, 0004"
}

assert_clean_dry_run_does_not_mutate() {
    work_dir=$(create_project dry-run)
    open_file=$work_dir/.coderail/tickets/open/0011-open-ticket.md
    done_file=$work_dir/.coderail/tickets/closed/0005-done-ticket.md

    write_ticket "$done_file" 0005 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$open_file" 0011 open-ticket "Open Ticket" open "0005" ""

    run_clean "$work_dir" --dry-run

    assert_success
    assert_stdout_content "update .coderail/tickets/open/0011-open-ticket.md
remove .coderail/tickets/closed/0005-done-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$done_file"
    assert_file "$open_file"
    assert_contains "$open_file" "dependencies: 0005"
}

assert_clean_rejects_active_tickets() {
    work_dir=$(create_project active)
    active_file=$work_dir/.coderail/tickets/active/0012-active-ticket.md
    done_file=$work_dir/.coderail/tickets/closed/0006-done-ticket.md

    write_ticket "$active_file" 0012 active-ticket "Active Ticket" active "" ""
    write_ticket "$done_file" 0006 done-ticket "Done Ticket" closed "" "close_reason: done
"

    run_clean "$work_dir"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: active tickets must be closed or deactivated before cleaning: .coderail/tickets/active/0012-active-ticket.md"
    assert_file "$active_file"
    assert_file "$done_file"
}

assert_clean_missing_dependency_fails_without_mutation() {
    work_dir=$(create_project missing-dependency)
    open_file=$work_dir/.coderail/tickets/open/0013-missing-dependency.md

    write_ticket "$open_file" 0013 missing-dependency "Missing Dependency" open "9999" ""

    run_clean "$work_dir"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket reference not found: 9999"
    assert_file "$open_file"
    assert_contains "$open_file" "dependencies: 9999"
}

assert_prune_decline_does_not_mutate() {
    work_dir=$(create_project prune-decline)
    done_file=$work_dir/.coderail/tickets/closed/0007-done-ticket.md
    dismissed_file=$work_dir/.coderail/tickets/closed/0008-dismissed-ticket.md
    blocked_file=$work_dir/.coderail/tickets/open/0013-blocked-ticket.md
    cascade_file=$work_dir/.coderail/tickets/open/0014-cascade-ticket.md

    write_ticket "$done_file" 0007 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$dismissed_file" 0008 dismissed-ticket "Dismissed Ticket" closed "" "close_reason: dismissed
"
    write_ticket "$blocked_file" 0013 blocked-ticket "Blocked Ticket" open "0008" ""
    write_ticket "$cascade_file" 0014 cascade-ticket "Cascade Ticket" open "0013" ""

    run_clean_with_input "$work_dir" "n
" --prune

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "The following tickets would only be removed because --prune was used:"
    assert_contains "$run_stderr" ".coderail/tickets/closed/0008-dismissed-ticket.md"
    assert_contains "$run_stderr" ".coderail/tickets/open/0013-blocked-ticket.md"
    assert_contains "$run_stderr" ".coderail/tickets/open/0014-cascade-ticket.md"
    assert_contains "$run_stderr" "error: clean aborted"
    assert_file "$done_file"
    assert_file "$dismissed_file"
    assert_file "$blocked_file"
    assert_file "$cascade_file"
}

assert_prune_yes_removes_closed_and_unsatisfied_open_tickets() {
    work_dir=$(create_project prune-yes)
    keep_file=$work_dir/.coderail/tickets/open/0015-keep-ticket.md
    blocked_file=$work_dir/.coderail/tickets/open/0016-blocked-ticket.md
    cascade_file=$work_dir/.coderail/tickets/open/0017-cascade-ticket.md
    done_file=$work_dir/.coderail/tickets/closed/0009-done-ticket.md
    dismissed_file=$work_dir/.coderail/tickets/closed/0010-dismissed-ticket.md
    duplicate_dismissed_file=$work_dir/.coderail/tickets/closed/0011-duplicate-dismissed.md
    duplicate_done_file=$work_dir/.coderail/tickets/closed/0012-duplicate-done.md

    write_ticket "$done_file" 0009 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$dismissed_file" 0010 dismissed-ticket "Dismissed Ticket" closed "" "close_reason: dismissed
"
    write_ticket "$duplicate_dismissed_file" 0011 duplicate-dismissed "Duplicate Dismissed" closed "" "close_reason: duplicate
duplicate_of: 0010
"
    write_ticket "$duplicate_done_file" 0012 duplicate-done "Duplicate Done" closed "" "close_reason: duplicate
duplicate_of: 0009
"
    write_ticket "$keep_file" 0015 keep-ticket "Keep Ticket" open "0009, 0012" ""
    write_ticket "$blocked_file" 0016 blocked-ticket "Blocked Ticket" open "0010" ""
    write_ticket "$cascade_file" 0017 cascade-ticket "Cascade Ticket" open "0016" ""

    run_clean "$work_dir" --prune --yes

    assert_success
    assert_stdout_content "update .coderail/tickets/open/0015-keep-ticket.md
remove .coderail/tickets/closed/0009-done-ticket.md
remove .coderail/tickets/closed/0010-dismissed-ticket.md
remove .coderail/tickets/closed/0011-duplicate-dismissed.md
remove .coderail/tickets/closed/0012-duplicate-done.md
remove .coderail/tickets/open/0016-blocked-ticket.md
remove .coderail/tickets/open/0017-cascade-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$keep_file"
    assert_contains "$keep_file" "dependencies:"
    assert_not_contains "$keep_file" "dependencies: 0009"
    assert_path_missing "$done_file"
    assert_path_missing "$dismissed_file"
    assert_path_missing "$duplicate_dismissed_file"
    assert_path_missing "$duplicate_done_file"
    assert_path_missing "$blocked_file"
    assert_path_missing "$cascade_file"
}

print_tests_header "Ticket Clean Tests"
test "Clean removes satisfied closed tickets" assert_clean_removes_satisfied_closed_tickets
test "Clean dry run does not mutate" assert_clean_dry_run_does_not_mutate
test "Clean rejects active tickets" assert_clean_rejects_active_tickets
test "Clean missing dependency fails without mutation" assert_clean_missing_dependency_fails_without_mutation
test "Prune decline does not mutate" assert_prune_decline_does_not_mutate
test "Prune yes removes closed and unsatisfied open tickets" assert_prune_yes_removes_closed_and_unsatisfied_open_tickets

print_tests_summary

if some_tests_failed; then
    exit 1
fi
