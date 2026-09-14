#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_ticket_next()
{
    sh -eu -c '
        _CR_INSTALL_DIR=$1
        shift
        _CR_SUCCESS_EXIT_CODE=0
        _CR_ERROR_EXIT_CODE=1
        _CR_USAGE_EXIT_CODE=2
        log_level=1
        log_color=0
        log_interactive=0
        . "$_CR_INSTALL_DIR/lib/utils/log.sh"
        . "$_CR_INSTALL_DIR/lib/utils/fs.sh"
        . "$_CR_INSTALL_DIR/lib/utils/md.sh"
        reinit_log
        . "$_CR_INSTALL_DIR/lib/commands/ticket.sh"
        execute_command next "$@"
    ' ticket-next-test "$PROJECT_ROOT" "$@"
}

_write_test_ticket()
{
    fixture_path="$1"
    shift
    printf '%s\n' '---' "$@" '---' > "$fixture_path"
}

print_tests_header "Ticket Next Command Tests"

test_expect "next: missing ticket directories" '' _run_ticket_next
mkdir -p .coderail/tickets/open .coderail/tickets/active .coderail/tickets/close
test_expect "next: empty ticket directories" '' _run_ticket_next

_write_test_ticket .coderail/tickets/close/0010-done.md 'status: closed' 'reason: done'
_write_test_ticket .coderail/tickets/close/0011-duplicate.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0010'
_write_test_ticket .coderail/tickets/close/0012-dismissed.md 'status: closed' 'reason: dismissed'
_write_test_ticket .coderail/tickets/active/0013-active.md 'status: active'
_write_test_ticket .coderail/tickets/open/0001-blocked.md 'status: open' 'depends-on: 0013'
test_expect "next: no eligible tickets" '' _run_ticket_next

_write_test_ticket .coderail/tickets/open/0002-ready.md 'status: open'
_write_test_ticket .coderail/tickets/open/0003-dependent.md 'status: open' 'depends-on: 0010, 0011'
_write_test_ticket .coderail/tickets/open/0004-empty.md 'status: open' 'depends-on:'
_write_test_ticket .coderail/tickets/open/0005-missing.md 'status: open' 'depends-on: 9999'
_write_test_ticket .coderail/tickets/open/0006-dismissed.md 'status: open' 'depends-on: 0012'
_write_test_ticket .coderail/tickets/open/0007-active.md 'status: active'
_write_test_ticket .coderail/tickets/open/0008-invalid.md 'malformed'
mkdir .coderail/tickets/open/0009-directory.md

expected_paths=$(printf '%s\n' .coderail/tickets/open/0002-ready.md \
    .coderail/tickets/open/0003-dependent.md .coderail/tickets/open/0004-empty.md)
test_expect "next: lists only eligible open tickets in filename order" "$expected_paths" _run_ticket_next
for option in -l --limit; do
    test_expect "next: $option counts eligible tickets" '.coderail/tickets/open/0002-ready.md' \
        _run_ticket_next "$option" 1
done
test_expect "next: --limit=value" "$(printf '%s\n' .coderail/tickets/open/0002-ready.md .coderail/tickets/open/0003-dependent.md)" \
    _run_ticket_next --limit=2
test_expect "next: limit exceeds eligible count" "$expected_paths" _run_ticket_next --limit 10
test_expect "next: -- terminates options" "$expected_paths" _run_ticket_next --

_expect_next_usage_error()
{
    actual_status=0
    _run_ticket_next "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq 2 ] && [ ! -s "$test_dir/stdout" ] && [ -s "$test_dir/stderr" ]
}

for limit in 0 01 -1 abc 1.5; do
    test "next: rejects limit $limit" _expect_next_usage_error --limit "$limit"
done
for option in -l --limit --limit= --unknown --help=value; do
    test "next: rejects invalid option $option" _expect_next_usage_error "$option"
done
test "next: rejects positional argument" _expect_next_usage_error ticket
test "next: rejects positional argument after --" _expect_next_usage_error -- ticket
test "next: help succeeds" _run_ticket_next --help

print_tests_summary

if some_tests_failed; then
    exit 1
fi
