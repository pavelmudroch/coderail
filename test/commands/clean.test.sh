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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-clean-test.XXXXXX")

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

assert_not_contains() {
    ! grep -F "$2" "$1" >/dev/null || fail "$1 contains: $2"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
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

    mkdir -p "$project_dir/.coderail"
    printf 'user conf\n' > "$project_dir/.coderail/conf.ini"
    printf '[default]\ntrue\n' > "$project_dir/.coderail/test.map"

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

create_cleanup_plan_project() {
    project_dir=$(create_project "$1")
    closed_dir=$project_dir/.coderail/tickets/closed

    mkdir -p "$closed_dir"
    mkdir -p "$project_dir/.coderail/notes"
    printf 'scope\n' > "$project_dir/.coderail/SCOPE.md"
    printf 'spec\n' > "$project_dir/.coderail/SPEC.md"
    printf 'nested note\n' > "$project_dir/.coderail/notes/nested.txt"
    printf 'unknown\n' > "$project_dir/.coderail/z.txt"
    write_ticket "$closed_dir/0001-done-ticket.md" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"

    printf '%s\n' "$project_dir"
}

run_cr() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_help_lists_clean() {
    work_dir=$tmp_dir/top-help
    mkdir "$work_dir"

    run_cr "$work_dir" --help

    assert_success
    assert_contains "$run_stdout" "  clean         Clean stale Coderail workflow files"
    assert_file_empty "$run_stderr"
}

assert_clean_help_documents_dry_run() {
    work_dir=$(create_project help)

    run_cr "$work_dir" clean --help

    assert_success
    assert_contains "$run_stdout" "Usage:"
    assert_contains "$run_stdout" "  cr clean [options]"
    assert_contains "$run_stdout" "  --dry-run"
    assert_not_contains "$run_stdout" "--prune"
    assert_not_contains "$run_stdout" "--yes"
    assert_file_empty "$run_stderr"
}

assert_missing_coderail_fails() {
    work_dir=$tmp_dir/missing-coderail
    mkdir "$work_dir"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: coderail directory not found: .coderail; run cr init before proceeding"
}

assert_noop_preserves_config_files() {
    work_dir=$(create_project noop)

    run_cr "$work_dir" clean

    assert_success
    assert_stdout_content "nothing to clean"
    assert_file_empty "$run_stderr"
    assert_file_content "$work_dir/.coderail/conf.ini" "user conf"
    assert_file_content "$work_dir/.coderail/test.map" "[default]
true"
}

assert_empty_directories_are_ignored() {
    work_dir=$(create_project empty-directories)
    mkdir -p "$work_dir/.coderail/tickets/open"
    mkdir -p "$work_dir/.coderail/tickets/active"
    mkdir -p "$work_dir/.coderail/tickets/closed"
    mkdir -p "$work_dir/.coderail/notes"

    run_cr "$work_dir" clean --dry-run

    assert_success
    assert_stdout_content "nothing to clean"
    assert_file_empty "$run_stderr"
    assert_file "$work_dir/.coderail/conf.ini"
    assert_file "$work_dir/.coderail/test.map"
}

assert_clean_rejects_legacy_options() {
    work_dir=$(create_project legacy-options)

    run_cr "$work_dir" clean --prune
    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: unknown option: --prune"

    run_cr "$work_dir" clean --yes
    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: unknown option: --yes"
}

assert_clean_removes_done_tickets_and_stale_files() {
    work_dir=$(create_project done-readiness)
    closed_dir=$work_dir/.coderail/tickets/closed
    done_file=$closed_dir/0001-done-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$done_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"

    run_cr "$work_dir" clean

    assert_success
    assert_stdout_content "remove .coderail/notes.md
remove .coderail/tickets/closed/0001-done-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$work_dir/.coderail/conf.ini"
    assert_file "$work_dir/.coderail/test.map"
    assert_path_missing "$stale_file"
    assert_path_missing "$done_file"
}

assert_clean_dry_run_prints_full_removal_plan() {
    work_dir=$(create_cleanup_plan_project dry-run-plan)

    run_cr "$work_dir" clean --dry-run

    assert_success
    assert_stdout_content "remove .coderail/SCOPE.md
remove .coderail/SPEC.md
remove .coderail/notes/nested.txt
remove .coderail/tickets/closed/0001-done-ticket.md
remove .coderail/z.txt"
    assert_file_empty "$run_stderr"
    assert_file "$work_dir/.coderail/conf.ini"
    assert_file "$work_dir/.coderail/test.map"
    assert_file "$work_dir/.coderail/SCOPE.md"
    assert_file "$work_dir/.coderail/SPEC.md"
    assert_file "$work_dir/.coderail/notes/nested.txt"
    assert_file "$work_dir/.coderail/z.txt"
    assert_file "$work_dir/.coderail/tickets/closed/0001-done-ticket.md"
}

assert_clean_dry_run_requires_ticket_evidence() {
    work_dir=$(create_project dry-run-no-ticket-evidence)
    stale_file=$work_dir/.coderail/notes.md

    printf 'branch notes\n' > "$stale_file"

    run_cr "$work_dir" clean --dry-run

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: stale file cleanup requires at least one ticket file"
    assert_file "$stale_file"
}

assert_clean_actual_matches_dry_run_plan() {
    dry_run_dir=$(create_cleanup_plan_project actual-plan-dry-run)
    actual_dir=$(create_cleanup_plan_project actual-plan)
    dry_run_stdout=$tmp_dir/dry-run-plan.stdout

    run_cr "$dry_run_dir" clean --dry-run
    assert_success
    cp "$run_stdout" "$dry_run_stdout"

    run_cr "$actual_dir" clean

    assert_success
    cmp "$dry_run_stdout" "$run_stdout" >/dev/null ||
        fail "actual clean output differs from dry-run"
    assert_file_empty "$run_stderr"
    assert_file "$actual_dir/.coderail/conf.ini"
    assert_file "$actual_dir/.coderail/test.map"
    assert_path_missing "$actual_dir/.coderail/SCOPE.md"
    assert_path_missing "$actual_dir/.coderail/SPEC.md"
    assert_path_missing "$actual_dir/.coderail/notes/nested.txt"
    assert_path_missing "$actual_dir/.coderail/z.txt"
    assert_path_missing "$actual_dir/.coderail/tickets/closed/0001-done-ticket.md"
}

assert_clean_dry_run_allows_duplicate_chain_to_done() {
    work_dir=$(create_project duplicate-readiness)
    closed_dir=$work_dir/.coderail/tickets/closed
    done_file=$closed_dir/0001-done-ticket.md
    duplicate_file=$closed_dir/0002-duplicate-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$done_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$duplicate_file" 0002 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"

    run_cr "$work_dir" clean --dry-run

    assert_success
    assert_stdout_content "remove .coderail/notes.md
remove .coderail/tickets/closed/0001-done-ticket.md
remove .coderail/tickets/closed/0002-duplicate-ticket.md"
    assert_file_empty "$run_stderr"
    assert_file "$stale_file"
    assert_file "$done_file"
    assert_file "$duplicate_file"
}

assert_clean_requires_ticket_evidence_for_stale_files() {
    work_dir=$(create_project no-ticket-evidence)
    stale_file=$work_dir/.coderail/notes.md

    printf 'branch notes\n' > "$stale_file"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: stale file cleanup requires at least one ticket file"
    assert_file "$stale_file"
}

assert_clean_rejects_open_tickets() {
    work_dir=$(create_project open-ticket)
    open_dir=$work_dir/.coderail/tickets/open
    open_file=$open_dir/0001-open-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$open_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$open_file" 0001 open-ticket "Open Ticket" open "" ""

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: open tickets are not resolved: .coderail/tickets/open/0001-open-ticket.md"
    assert_file "$stale_file"
    assert_file "$open_file"
}

assert_clean_rejects_active_tickets() {
    work_dir=$(create_project active-ticket)
    active_dir=$work_dir/.coderail/tickets/active
    active_file=$active_dir/0001-active-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$active_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$active_file" 0001 active-ticket "Active Ticket" active "" ""

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: active tickets are not resolved: .coderail/tickets/active/0001-active-ticket.md"
    assert_file "$stale_file"
    assert_file "$active_file"
}

assert_clean_rejects_invalid_ticket_files() {
    work_dir=$(create_project invalid-ticket)
    closed_dir=$work_dir/.coderail/tickets/closed
    invalid_file=$closed_dir/0001-wrong-name.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$invalid_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket filename must match id and slug: 0001-done-ticket.md"
    assert_file "$stale_file"
    assert_file "$invalid_file"
}

assert_clean_rejects_unsupported_close_reasons() {
    work_dir=$(create_project unsupported-close-reason)
    closed_dir=$work_dir/.coderail/tickets/closed
    invalid_file=$closed_dir/0001-cancelled-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$invalid_file" 0001 cancelled-ticket "Cancelled Ticket" closed "" "close_reason: cancelled
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: invalid close reason: cancelled"
    assert_file "$stale_file"
    assert_file "$invalid_file"
}

assert_clean_rejects_duplicate_missing_target() {
    work_dir=$(create_project duplicate-missing)
    closed_dir=$work_dir/.coderail/tickets/closed
    duplicate_file=$closed_dir/0001-duplicate-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$duplicate_file" 0001 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 9999
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ticket reference not found: 9999"
    assert_file "$stale_file"
    assert_file "$duplicate_file"
}

assert_clean_rejects_duplicate_ambiguous_target() {
    work_dir=$(create_project duplicate-ambiguous)
    open_dir=$work_dir/.coderail/tickets/open
    closed_dir=$work_dir/.coderail/tickets/closed
    open_file=$open_dir/0001-open-ticket.md
    done_file=$closed_dir/0001-done-ticket.md
    duplicate_file=$closed_dir/0002-duplicate-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$open_dir"
    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$open_file" 0001 open-ticket "Open Ticket" open "" ""
    write_ticket "$done_file" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$duplicate_file" 0002 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: ambiguous ticket reference: 0001"
    assert_file "$stale_file"
    assert_file "$open_file"
    assert_file "$done_file"
    assert_file "$duplicate_file"
}

assert_clean_rejects_duplicate_cycle() {
    work_dir=$(create_project duplicate-cycle)
    closed_dir=$work_dir/.coderail/tickets/closed
    first_file=$closed_dir/0001-first-ticket.md
    second_file=$closed_dir/0002-second-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$first_file" 0001 first-ticket "First Ticket" closed "" "close_reason: duplicate
duplicate_of: 0002
"
    write_ticket "$second_file" 0002 second-ticket "Second Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: duplicate ticket cycle: .coderail/tickets/closed/0001-first-ticket.md"
    assert_file "$stale_file"
    assert_file "$first_file"
    assert_file "$second_file"
}

assert_clean_rejects_duplicate_open_target() {
    work_dir=$(create_project duplicate-open-target)
    open_dir=$work_dir/.coderail/tickets/open
    closed_dir=$work_dir/.coderail/tickets/closed
    open_file=$open_dir/0001-open-ticket.md
    duplicate_file=$closed_dir/0002-duplicate-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$open_dir"
    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$open_file" 0001 open-ticket "Open Ticket" open "" ""
    write_ticket "$duplicate_file" 0002 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: duplicate target is not closed: .coderail/tickets/open/0001-open-ticket.md"
    assert_file "$stale_file"
    assert_file "$open_file"
    assert_file "$duplicate_file"
}

assert_clean_rejects_duplicate_non_done_terminal() {
    work_dir=$(create_project duplicate-dismissed-target)
    closed_dir=$work_dir/.coderail/tickets/closed
    dismissed_file=$closed_dir/0001-dismissed-ticket.md
    duplicate_file=$closed_dir/0002-duplicate-ticket.md
    stale_file=$work_dir/.coderail/notes.md

    mkdir -p "$closed_dir"
    printf 'branch notes\n' > "$stale_file"
    write_ticket "$dismissed_file" 0001 dismissed-ticket "Dismissed Ticket" closed "" "close_reason: dismissed
"
    write_ticket "$duplicate_file" 0002 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 0001
"

    run_cr "$work_dir" clean

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "error: closed ticket is not resolved: .coderail/tickets/closed/0001-dismissed-ticket.md"
    assert_file "$stale_file"
    assert_file "$dismissed_file"
    assert_file "$duplicate_file"
}

print_tests_header "Clean Tests"
test "Top-level help lists clean" assert_help_lists_clean
test "Clean help documents dry-run" assert_clean_help_documents_dry_run
test "Clean requires coderail directory" assert_missing_coderail_fails
test "Clean no-op preserves config files" assert_noop_preserves_config_files
test "Clean ignores empty directories" assert_empty_directories_are_ignored
test "Clean rejects legacy ticket-clean options" assert_clean_rejects_legacy_options
test "Clean removes done tickets and stale files" assert_clean_removes_done_tickets_and_stale_files
test "Clean dry run prints full removal plan" assert_clean_dry_run_prints_full_removal_plan
test "Clean dry run requires ticket evidence" assert_clean_dry_run_requires_ticket_evidence
test "Clean actual output matches dry-run plan" assert_clean_actual_matches_dry_run_plan
test "Clean dry run allows duplicate chain to done" assert_clean_dry_run_allows_duplicate_chain_to_done
test "Clean requires ticket evidence for stale files" assert_clean_requires_ticket_evidence_for_stale_files
test "Clean rejects open tickets" assert_clean_rejects_open_tickets
test "Clean rejects active tickets" assert_clean_rejects_active_tickets
test "Clean rejects invalid ticket files" assert_clean_rejects_invalid_ticket_files
test "Clean rejects unsupported close reasons" assert_clean_rejects_unsupported_close_reasons
test "Clean rejects duplicate missing target" assert_clean_rejects_duplicate_missing_target
test "Clean rejects duplicate ambiguous target" assert_clean_rejects_duplicate_ambiguous_target
test "Clean rejects duplicate cycle" assert_clean_rejects_duplicate_cycle
test "Clean rejects duplicate open target" assert_clean_rejects_duplicate_open_target
test "Clean rejects duplicate non-done terminal" assert_clean_rejects_duplicate_non_done_terminal

print_tests_summary

if some_tests_failed; then
    exit 1
fi
