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
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-validate-test.XXXXXX")

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

assert_line_before() {
    file=$1
    first=$2
    second=$3

    first_line=$(awk -v pattern="$first" 'index($0, pattern) { print NR; exit }' "$file")
    second_line=$(awk -v pattern="$second" 'index($0, pattern) { print NR; exit }' "$file")

    [ -n "$first_line" ] || fail "$file does not contain: $first"
    [ -n "$second_line" ] || fail "$file does not contain: $second"
    [ "$first_line" -lt "$second_line" ] ||
        fail "$first should appear before $second"
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

write_ticket_without_title() {
    ticket_file=$1

    mkdir -p "$(dirname "$ticket_file")"
    cat > "$ticket_file" <<'EOF'
---
id: 0002
slug: missing-title
status: open
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies:
---

# Missing Title
EOF
}

run_validate() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket validate "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_validate() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" --verbose ticket validate "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_validate_valid_ticket() {
    work_dir=$(create_project valid)

    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""

    run_validate "$work_dir" 1

    assert_success
    assert_file_empty "$run_stderr"
    assert_stdout_content ".coderail/tickets/open/0001-first-ticket.md is valid"
}

assert_validate_all_tickets() {
    work_dir=$(create_project all)

    write_ticket "$work_dir/.coderail/tickets/open/0001-open-ticket.md" 0001 open-ticket "Open Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/active/0002-active-ticket.md" 0002 active-ticket "Active Ticket" active "" ""

    run_validate "$work_dir"

    assert_success
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" ".coderail/tickets/open/0001-open-ticket.md is valid"
    assert_contains "$run_stdout" ".coderail/tickets/active/0002-active-ticket.md is valid"
}

assert_validate_collects_format_issues() {
    work_dir=$(create_project format-issues)

    write_ticket_without_title "$work_dir/.coderail/tickets/open/0002-missing-title.md"
    write_ticket "$work_dir/.coderail/tickets/open/0003-wrong-slug.md" 0003 wrong-slug "Right Slug" active "" "close_reason: done
"

    run_validate "$work_dir" 2 3

    assert_failure
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" ".coderail/tickets/open/0002-missing-title.md is invalid"
    assert_contains "$run_stdout" "missing ticket field: title"
    assert_contains "$run_stdout" ".coderail/tickets/open/0003-wrong-slug.md is invalid"
    assert_contains "$run_stdout" "ticket slug must match title: right-slug"
    assert_contains "$run_stdout" "ticket path does not match status: active"
    assert_contains "$run_stdout" "open and active tickets must not have close_reason"
}

assert_validate_checks_dependencies() {
    work_dir=$(create_project dependencies)

    write_ticket "$work_dir/.coderail/tickets/closed/0001-done-ticket.md" 0001 done-ticket "Done Ticket" closed "" "close_reason: done
"
    write_ticket "$work_dir/.coderail/tickets/open/0002-open-ticket.md" 0002 open-ticket "Open Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/closed/0003-blocked-ticket.md" 0003 blocked-ticket "Blocked Ticket" closed "0001, 0002, 9999" "close_reason: done
"

    run_validate "$work_dir" 3

    assert_failure
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" ".coderail/tickets/closed/0003-blocked-ticket.md is invalid"
    assert_contains "$run_stdout" "dependency not found: 9999"
    assert_contains "$run_stdout" "dependency is not satisfied: 0002"
}

assert_validate_checks_duplicate_target() {
    work_dir=$(create_project duplicate-target)

    write_ticket "$work_dir/.coderail/tickets/closed/0004-duplicate-ticket.md" 0004 duplicate-ticket "Duplicate Ticket" closed "" "close_reason: duplicate
duplicate_of: 9999
"

    run_validate "$work_dir" 4

    assert_failure
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" ".coderail/tickets/closed/0004-duplicate-ticket.md is invalid"
    assert_contains "$run_stdout" "duplicate ticket target not found: 9999"
}

assert_validate_logs_checks_before_result() {
    work_dir=$(create_project verbose)

    write_ticket "$work_dir/.coderail/tickets/open/0005-verbose-ticket.md" 0005 verbose-ticket "Verbose Ticket" open "" ""

    run_verbose_validate "$work_dir" 5

    assert_success
    assert_file_empty "$run_stderr"
    assert_contains "$run_stdout" "checking frontmatter: .coderail/tickets/open/0005-verbose-ticket.md"
    assert_line_before \
        "$run_stdout" \
        "checking dependencies: .coderail/tickets/open/0005-verbose-ticket.md" \
        ".coderail/tickets/open/0005-verbose-ticket.md is valid"
}

print_tests_header "Ticket Validate Tests"
test "Validate valid ticket" assert_validate_valid_ticket
test "Validate all tickets" assert_validate_all_tickets
test "Validate collects format issues" assert_validate_collects_format_issues
test "Validate checks dependencies" assert_validate_checks_dependencies
test "Validate checks duplicate target" assert_validate_checks_duplicate_target
test "Validate logs checks before result" assert_validate_logs_checks_before_result

print_tests_summary

if some_tests_failed; then
    exit 1
fi
