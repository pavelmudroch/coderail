#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_ticket_close()
{
    sh -eu -c '
        _CR_INSTALL_DIR=$1
        shift
        _CR_SUCCESS_EXIT_CODE=0
        _CR_ERROR_EXIT_CODE=1
        _CR_USAGE_EXIT_CODE=2
        EOL="
"
        log_level=1
        log_color=0
        log_interactive=0
        . "$_CR_INSTALL_DIR/lib/utils/log.sh"
        . "$_CR_INSTALL_DIR/lib/utils/fs.sh"
        . "$_CR_INSTALL_DIR/lib/utils/path.sh"
        . "$_CR_INSTALL_DIR/lib/utils/md.sh"
        . "$_CR_INSTALL_DIR/lib/utils/text.sh"
        reinit_log

        _CR_TEMP_RESOURCE_FILE="$PWD/resources"
        : > "$_CR_TEMP_RESOURCE_FILE"
        register_temp_resource()
        {
            printf "%s\n" "$1" >> "$_CR_TEMP_RESOURCE_FILE"
        }
        cleanup()
        {
            command_status=$?
            trap - 0 HUP INT TERM
            while IFS= read -r resource; do
                rm -rf "$resource"
            done < "$_CR_TEMP_RESOURCE_FILE"
            rm -f "$_CR_TEMP_RESOURCE_FILE"
            exit "$command_status"
        }
        trap cleanup 0
        trap "exit 129" HUP
        trap "exit 130" INT
        trap "exit 143" TERM

        if [ "${CLOSE_FAIL_WRITE:-0}" -eq 1 ]; then
            fs_write() { cat > /dev/null; return 1; }
        fi
        if [ "${CLOSE_FAIL_REMOVE:-0}" -eq 1 ]; then
            rm()
            {
                [ "${2-}" != ".coderail/tickets/active/0020-failure.md" ] || return 1
                command rm "$@"
            }
        fi

        . "$_CR_INSTALL_DIR/lib/commands/ticket.sh"
        execute_command close "$@"
    ' ticket-close-test "$PROJECT_ROOT" "$@"
}

_write_test_ticket()
{
    fixture_path="$1"
    shift
    printf '%s\n' '---' "$@" '---' > "$fixture_path"
}

_expect_close_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_ticket_close "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        [ -n "$(sed -n "/$expected_message/p" "$test_dir/stderr")" ]
}

print_tests_header "Ticket Close Command Tests"

mkdir -p .coderail/tickets/open .coderail/tickets/active
_write_test_ticket .coderail/tickets/active/0001-first.md 'title: First' 'status: active' 'reason: deferred' 'duplicate-of: 9999' 'custom: preserved'
printf '\n# Body\n\nPreserve this.\n\n' >> .coderail/tickets/active/0001-first.md
sed -e 's/status: active/status: closed/' -e 's/reason: deferred/reason: done/' -e 's/duplicate-of: 9999/duplicate-of: /' .coderail/tickets/active/0001-first.md > "$test_dir/expected"
test_expect "close: default done creates close directory" '.coderail/tickets/close/0001-first.md' _run_ticket_close 0001
test "close: preserves body and unrelated metadata" cmp "$test_dir/expected" .coderail/tickets/close/0001-first.md
test "close: removes source" test ! -e .coderail/tickets/active/0001-first.md
test "close: rejects already closed" _expect_close_failure 1 'Ticket is not open or active' 0001

_write_test_ticket .coderail/tickets/open/0002-open.md 'status: open' 'depends-on: 9999'
test "close: done requires active" _expect_close_failure 1 'Ticket is not active' 0002
_write_test_ticket .coderail/tickets/active/0003-blocked.md 'status: active' 'depends-on: 9999'
test "close: done requires satisfied dependencies" _expect_close_failure 1 'dependencies are not satisfied' 0003
test_expect "close: deferred ignores dependencies" '.coderail/tickets/close/0002-open.md' _run_ticket_close --reason=deferred open
test_expect "close: dismissed ignores dependencies" '.coderail/tickets/close/0003-blocked.md' _run_ticket_close --reason dismissed 0003-blocked

for state in open active; do
    _write_test_ticket .coderail/tickets/$state/0004-duplicate.md "status: $state" 'depends-on: 9999'
    test "close: duplicate requires target" _expect_close_failure 2 'is required' --reason duplicate 0004
    test "close: rejects missing target" _expect_close_failure 1 'Failed to resolve duplicate ticket' --reason duplicate --duplicate-of missing 0004
    test "close: rejects self reference" _expect_close_failure 1 'duplicate of itself' --reason duplicate --duplicate-of duplicate 0004
    test_expect "close: duplicate accepts $state" '.coderail/tickets/close/0004-duplicate.md' _run_ticket_close --reason duplicate --duplicate-of=first 0004
    test_expect "close: stores stable duplicate ID" '0001' sh -c '. "$1"; md_frontmatter_get duplicate-of < "$2"' close-test "$PROJECT_ROOT/lib/utils/md.sh" .coderail/tickets/close/0004-duplicate.md
    rm .coderail/tickets/close/0004-duplicate.md
done

_write_test_ticket .coderail/tickets/active/0005-dependent.md 'status: active' 'depends-on: 0001'
test_expect "close: done accepts satisfied dependencies and separator" '.coderail/tickets/close/0005-dependent.md' _run_ticket_close -- 0005
_write_test_ticket .coderail/tickets/active/0006-mismatch.md 'status: open'
test "close: rejects mismatched state" _expect_close_failure 1 'Ticket is not open or active' 0006
printf 'invalid\n' > .coderail/tickets/active/0007-invalid.md
test "close: rejects invalid front matter" _expect_close_failure 1 'Failed to read ticket' 0007
printf 'preserve\n' > .coderail/tickets/~0006-mismatch.md.lock
test "close: rejects locked ticket" _expect_close_failure 1 'Failed to lock ticket' 0006
test_expect "close: preserves existing lock" 'preserve' cat .coderail/tickets/~0006-mismatch.md.lock
rm .coderail/tickets/~0006-mismatch.md.lock

test "close: missing ticket" _expect_close_failure 1 'Failed to resolve ticket' missing
test "close: missing argument" _expect_close_failure 2 'Required ticket'
test "close: multiple tickets" _expect_close_failure 2 'Multiple tickets' 0001 0002
test "close: extra argument after separator" _expect_close_failure 2 'Multiple tickets' 0001 -- 0002
test "close: invalid reason" _expect_close_failure 2 'Invalid reason' --reason unknown 0001
test "close: duplicate option with done" _expect_close_failure 2 'only valid' --duplicate-of 0001 0002
for option in --reason --reason= --duplicate-of --duplicate-of=; do
    test "close: missing option value $option" _expect_close_failure 2 'Missing argument' 0001 "$option"
done
test "close: unknown option" _expect_close_failure 2 'Unknown option' --unknown
test "close: invalid help" _expect_close_failure 2 'does not take an argument' --help=value
test "close: help" _run_ticket_close --help

_write_test_ticket .coderail/tickets/active/0020-failure.md 'status: active'
cp .coderail/tickets/active/0020-failure.md "$test_dir/original"
CLOSE_FAIL_WRITE=1
export CLOSE_FAIL_WRITE
test "close: write failure" _expect_close_failure 1 'Failed to write closed ticket' 0020
unset CLOSE_FAIL_WRITE
test "close: write failure preserves source" cmp "$test_dir/original" .coderail/tickets/active/0020-failure.md
test "close: write failure leaves no destination" test ! -e .coderail/tickets/close/0020-failure.md
CLOSE_FAIL_REMOVE=1
export CLOSE_FAIL_REMOVE
test "close: removal failure" _expect_close_failure 1 'Failed to remove source ticket' 0020
unset CLOSE_FAIL_REMOVE
test "close: removal failure preserves source" cmp "$test_dir/original" .coderail/tickets/active/0020-failure.md
test "close: removal failure rolls back destination" test ! -e .coderail/tickets/close/0020-failure.md
ln -s missing .coderail/tickets/close/0020-failure.md
test "close: rejects existing destination" _expect_close_failure 1 'Ticket already exists' 0020
test "close: preserves destination symlink" test -L .coderail/tickets/close/0020-failure.md

test_expect "close: releases locks" '' find .coderail/tickets -name '*.lock'
test_expect "close: cleans temporary resources" '' find . -name '.cr-tmp-*'

mkdir blocked
cd blocked
mkdir -p .coderail/tickets/active
_write_test_ticket .coderail/tickets/active/0001-blocked.md 'status: active'
printf 'preserve\n' > .coderail/tickets/close
test "close: blocked destination directory" _expect_close_failure 1 'Cannot write to' 0001
test "close: preserves source on blocked directory" test -f .coderail/tickets/active/0001-blocked.md
test_expect "close: preserves blocked destination" 'preserve' cat .coderail/tickets/close
test_expect "close: blocked directory releases lock" '' find .coderail/tickets -name '*.lock'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
