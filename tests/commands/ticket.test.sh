#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"
. "$PROJECT_ROOT/lib/commands/ticket.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
cd "$test_dir"

print_tests_header "Ticket Command Tests"

test_expect_fail "_resolve_ticket_path: resolve without ticket directories" 'Not found' \
    _resolve_ticket_path "0001"

mkdir -p .coderail/tickets/open .coderail/tickets/active .coderail/tickets/close
: > .coderail/tickets/open/0001-some-ticket-title.md
: > .coderail/tickets/active/0002-active-ticket.md
: > .coderail/tickets/close/12093-closed-ticket.md

test_expect "_resolve_ticket_path: resolve ID" ".coderail/tickets/open/0001-some-ticket-title.md" \
    _resolve_ticket_path "0001"
test_expect "_resolve_ticket_path: resolve title slug" ".coderail/tickets/open/0001-some-ticket-title.md" \
    _resolve_ticket_path "some-ticket-title"
test_expect "_resolve_ticket_path: resolve full slug" ".coderail/tickets/open/0001-some-ticket-title.md" \
    _resolve_ticket_path "0001-some-ticket-title"
test_expect "_resolve_ticket_path: resolve active ticket" ".coderail/tickets/active/0002-active-ticket.md" \
    _resolve_ticket_path "0002"
test_expect "_resolve_ticket_path: resolve closed ticket with longer ID" ".coderail/tickets/close/12093-closed-ticket.md" \
    _resolve_ticket_path "12093"
test_expect_fail "_resolve_ticket_path: reject partial ID" 'Not found' _resolve_ticket_path "000"
test_expect_fail "_resolve_ticket_path: preserve leading zeros" 'Not found' _resolve_ticket_path "1"
test_expect_fail "_resolve_ticket_path: reject partial title" 'Not found' \
    _resolve_ticket_path "ticket-title"
test_expect_fail "_resolve_ticket_path: treat glob characters literally" 'Not found' _resolve_ticket_path "*"

mkdir .coderail/tickets/open/0003-directory.md
test_expect_fail "_resolve_ticket_path: ignore directories" 'Not found' _resolve_ticket_path "0003"

: > .coderail/tickets/active/0001-another-title.md
test_expect_fail "_resolve_ticket_path: reject duplicate IDs across states" 'Multiple occurrences found' \
    _resolve_ticket_path "0001"
: > .coderail/tickets/open/0004-some-ticket-title.md
test_expect_fail "_resolve_ticket_path: reject duplicate titles within a state" 'Multiple occurrences found' \
    _resolve_ticket_path "some-ticket-title"
: > .coderail/tickets/close/0001-some-ticket-title.md
test_expect_fail "_resolve_ticket_path: reject duplicate full slugs across states" 'Multiple occurrences found' \
    _resolve_ticket_path "0001-some-ticket-title"

_test_ambiguous_lookup_has_no_stdout()
{
    if actual=$(_resolve_ticket_path "0001" 2> "$test_dir/error"); then
        return 1
    fi
    [ -z "$actual" ] && [ -s "$test_dir/error" ]
}

test "_resolve_ticket_path: ambiguous lookup writes only to stderr" _test_ambiguous_lookup_has_no_stdout

_test_ticket_lock_lifecycle()
{
    _lock_ticket ".coderail/tickets/open/0010-lock-test.md" || return 1
    lock_file=".coderail/tickets/~0010-lock-test.md.lock"
    [ -f "$lock_file" ] || return 1
    printf '%s\n' 'preserve' > "$lock_file"

    if _lock_ticket ".coderail/tickets/active/0010-lock-test.md" 2>/dev/null; then
        return 1
    fi
    [ "$(cat "$lock_file")" = "preserve" ] || return 1

    _unlock_ticket ".coderail/tickets/active/0010-lock-test.md" || return 1
    [ ! -e "$lock_file" ] || return 1
    _unlock_ticket ".coderail/tickets/active/0010-lock-test.md" || return 1
    _lock_ticket ".coderail/tickets/close/0010-lock-test.md" || return 1
    _unlock_ticket ".coderail/tickets/close/0010-lock-test.md"
}

_test_ticket_lock_missing_directory()
(
    TICKETS_PATH="$test_dir/missing"
    if _lock_ticket "0011-missing-directory.md" 2>/dev/null; then
        return 1
    fi
    _unlock_ticket "0011-missing-directory.md"
)

_test_ticket_unlock_failure()
{
    mkdir ".coderail/tickets/~0012-cannot-delete.md.lock" || return 1
    if _unlock_ticket "0012-cannot-delete.md" 2>/dev/null; then
        return 1
    fi
    [ -d ".coderail/tickets/~0012-cannot-delete.md.lock" ]
}

_test_concurrent_ticket_lock()
(
    mkdir "$test_dir/lock-results" || return 1
    attempt=0
    while [ "$attempt" -lt 12 ]; do
        (
            if _lock_ticket "0013-concurrent.md" 2>/dev/null; then
                : > "$test_dir/lock-results/$attempt"
            fi
        ) &
        attempt=$((attempt + 1))
    done
    wait

    set -- "$test_dir/lock-results/"*
    [ "$#" -eq 1 ] && [ -f "$1" ] || return 1
    _unlock_ticket "0013-concurrent.md"
)

test "_lock_ticket/_unlock_ticket: lock survives state changes and unlock is idempotent" _test_ticket_lock_lifecycle
test "_lock_ticket/_unlock_ticket: lock fails with missing directory and unlock succeeds" _test_ticket_lock_missing_directory
test "_unlock_ticket: unlock reports deletion failure" _test_ticket_unlock_failure
test "_lock_ticket: concurrent lock attempts have exactly one winner" _test_concurrent_ticket_lock

mkdir "$test_dir/satisfaction"
cd "$test_dir/satisfaction"
mkdir -p .coderail/tickets/open .coderail/tickets/active .coderail/tickets/close

_write_test_ticket()
{
    fixture_path="$1"
    shift
    printf '%s\n' '---' "$@" '---' > "$fixture_path"
}

_expect_satisfied_status()
{
    expected_status="$1"
    actual_status=0
    actual_output=$(_ticket_is_satisfied "$2" 2>&1) || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ -z "$actual_output" ]
}

_write_test_ticket .coderail/tickets/close/0001-done.md 'status: closed' 'reason: done'
test "_ticket_is_satisfied: closed as done is satisfied" _expect_satisfied_status 0 .coderail/tickets/close/0001-done.md

for state in open active; do
    _write_test_ticket ".coderail/tickets/$state/0002-unfinished.md" "status: $state" 'reason: done'
    test "_ticket_is_satisfied: $state is not satisfied even with reason done" _expect_satisfied_status 1 ".coderail/tickets/$state/0002-unfinished.md"
done

for reason in deferred dismissed unknown; do
    _write_test_ticket .coderail/tickets/close/0003-other.md 'status: closed' "reason: $reason"
    test "_ticket_is_satisfied: $reason is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/0003-other.md
done

_write_test_ticket .coderail/tickets/close/0004-duplicate.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0001'
_write_test_ticket .coderail/tickets/close/0005-chain.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0004-duplicate'
test "_ticket_is_satisfied: duplicate of done is satisfied" _expect_satisfied_status 0 .coderail/tickets/close/0004-duplicate.md
test "_ticket_is_satisfied: duplicate chain to done is satisfied" _expect_satisfied_status 0 .coderail/tickets/close/0005-chain.md

for target in done 0002 0003 9999 0004; do
    _write_test_ticket .coderail/tickets/close/0004-duplicate.md 'status: closed' 'reason: duplicate' "duplicate-of: $target"
    expected=1
    [ "$target" != done ] || expected=0
    test "_ticket_is_satisfied: duplicate target $target" _expect_satisfied_status "$expected" .coderail/tickets/close/0004-duplicate.md
done

_write_test_ticket .coderail/tickets/close/0004-duplicate.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0005'
test "_ticket_is_satisfied: duplicate cycle is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/0005-chain.md

for target in 0002-unfinished unfinished; do
    _write_test_ticket .coderail/tickets/close/0004-duplicate.md 'status: closed' 'reason: duplicate' "duplicate-of: $target"
    test "_ticket_is_satisfied: ambiguous duplicate target $target is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/0004-duplicate.md
done

for fields in 'status: closed' 'reason: done' 'malformed' 'status: closed
reason: done
reason: duplicate' 'status: closed
reason: duplicate' 'status: closed
reason: duplicate
duplicate-of: '; do
    _write_test_ticket .coderail/tickets/close/0006-invalid.md "$fields"
    test "_ticket_is_satisfied: invalid or incomplete metadata is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/0006-invalid.md
done

test "_ticket_is_satisfied: missing file is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/missing.md
printf '%s\n' '---' 'status: closed' 'reason: done' > .coderail/tickets/close/0006-invalid.md
test "_ticket_is_satisfied: unterminated front matter is not satisfied" _expect_satisfied_status 1 .coderail/tickets/close/0006-invalid.md

mkdir "$test_dir/dependencies"
cd "$test_dir/dependencies"
mkdir -p .coderail/tickets/open .coderail/tickets/active .coderail/tickets/close

_write_test_ticket .coderail/tickets/close/0001-done.md 'status: closed' 'reason: done'
_write_test_ticket .coderail/tickets/close/0002-done.md 'status: closed' 'reason: done'
_write_test_ticket .coderail/tickets/close/0003-duplicate.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0001'
_write_test_ticket .coderail/tickets/open/0004-unfinished.md 'status: open'
_write_test_ticket .coderail/tickets/active/0005-unfinished.md 'status: active'

_write_test_ticket .coderail/tickets/open/0073-dependent.md 'status: open'
test_expect "_ticket_dependencies_satisfied: no depends on field is satisfied" '' \
    _ticket_dependencies_satisfied .coderail/tickets/open/0073-dependent.md

_write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' 'depends-on:'
test_expect "_ticket_dependencies_satisfied: empty depends-on field is satisfied" '' \
    _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md

for dependency in 0001 0003; do
    _write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' "depends-on: $dependency"
    test_expect "_ticket_dependencies_satisfied: single satisfied ID $dependency" '' \
        _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md
done

for dependency in 0004 0005 9999; do
    _write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' "depends-on: $dependency"
    test_expect_fail "_ticket_dependencies_satisfied: single blocked ID $dependency" '' \
        _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md
done

for reason in deferred dismissed; do
    _write_test_ticket .coderail/tickets/close/0006-other.md 'status: closed' "reason: $reason"
    _write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' 'depends-on: 0006'
    test_expect_fail "_ticket_dependencies_satisfied: $reason dependency blocks" '' \
        _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md
done

for dependencies in '0001,0002' '0001,0002,0003'; do
    _write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' "depends-on: $dependencies"
    test_expect "_ticket_dependencies_satisfied: all IDs $dependencies satisfied" '' \
        _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md
done

for dependencies in '0004,0001,0002' '0001,0004,0002' '0001,0002,0004' '0001, 0004' '0001,9999'; do
    _write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' "depends-on: $dependencies"
    test_expect_fail "_ticket_dependencies_satisfied: blocked IDs $dependencies" '' \
        _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md
done

_write_test_ticket .coderail/tickets/active/0001-ambiguous.md 'status: active'
_write_test_ticket .coderail/tickets/open/0010-dependent.md 'status: open' 'depends-on: 0001'
test_expect_fail "_ticket_dependencies_satisfied: ambiguous dependency blocks" '' \
    _ticket_dependencies_satisfied .coderail/tickets/open/0010-dependent.md

print_tests_summary

if some_tests_failed; then
    exit 1
fi
