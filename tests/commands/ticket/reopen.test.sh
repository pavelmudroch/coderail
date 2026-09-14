#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_ticket_reopen()
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

        if [ "${REOPEN_FAIL_WRITE:-0}" -eq 1 ]; then
            fs_write() { cat > /dev/null; return 1; }
        fi
        if [ "${REOPEN_FAIL_REMOVE:-0}" -eq 1 ]; then
            rm()
            {
                [ "${2-}" != ".coderail/tickets/close/0020-failure.md" ] || return 1
                command rm "$@"
            }
        fi

        . "$_CR_INSTALL_DIR/lib/commands/ticket.sh"
        execute_command reopen "$@"
    ' ticket-reopen-test "$PROJECT_ROOT" "$@"
}

_write_test_ticket()
{
    fixture_path="$1"
    shift
    printf '%s\n' '---' "$@" '---' > "$fixture_path"
}

_expect_reopen_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_ticket_reopen "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        [ -n "$(sed -n "/$expected_message/p" "$test_dir/stderr")" ]
}

print_tests_header "Ticket Reopen Command Tests"

mkdir -p .coderail/tickets/close .coderail/tickets/active
_write_test_ticket .coderail/tickets/close/0001-first.md 'title: First' 'status: closed' 'reason: duplicate' 'duplicate-of: 9999' 'depends-on: 9998' 'custom: preserved'
printf '\n# Body\n\nPreserve this.\n\n' >> .coderail/tickets/close/0001-first.md
sed -e 's/status: closed/status: open/' -e '/^reason:/d' -e '/^duplicate-of:/d' .coderail/tickets/close/0001-first.md > "$test_dir/expected"
printf 'reason: body text\nduplicate-of: body text\n' >> .coderail/tickets/close/0001-first.md
printf 'reason: body text\nduplicate-of: body text\n' >> "$test_dir/expected"
test_expect "reopen: creates open directory" '.coderail/tickets/open/0001-first.md' _run_ticket_reopen 0001
test "reopen: removes closure fields and preserves body, dependencies and unrelated metadata" cmp "$test_dir/expected" .coderail/tickets/open/0001-first.md
test "reopen: removes source" test ! -e .coderail/tickets/close/0001-first.md
test "reopen: rejects open ticket" _expect_reopen_failure 1 'Ticket is not closed' 0001

_write_test_ticket .coderail/tickets/active/0002-active.md 'status: active'
test "reopen: rejects active ticket" _expect_reopen_failure 1 'Ticket is not closed' 0002
_write_test_ticket .coderail/tickets/close/0003-dependent.md 'status: closed' 'depends-on: 9998, 9999'
test_expect "reopen: merges repeated dependency options resolved by ID and slug" '.coderail/tickets/open/0003-dependent.md' _run_ticket_reopen -d first --depends-on 0002 --depends-on=0001-first dependent
test_expect "reopen: retains existing dependencies and stores added IDs" '9998, 9999, 0001, 0002, 0001' sh -c '. "$1"; md_frontmatter_get depends-on < "$2"' reopen-test "$PROJECT_ROOT/lib/utils/md.sh" .coderail/tickets/open/0003-dependent.md

_write_test_ticket .coderail/tickets/close/0004-fourth.md 'status: closed'
cp .coderail/tickets/close/0004-fourth.md "$test_dir/original"
test "reopen: rejects missing dependency" _expect_reopen_failure 1 'Failed to resolve dependency' -d missing 0004
test "reopen: rejects self dependency" _expect_reopen_failure 1 'cannot depend on itself' -d fourth 0004
test "reopen: dependency failures preserve source" cmp "$test_dir/original" .coderail/tickets/close/0004-fourth.md
test_expect "reopen: accepts full slug after separator" '.coderail/tickets/open/0004-fourth.md' _run_ticket_reopen -- 0004-fourth

_write_test_ticket .coderail/tickets/close/0005-mismatch.md 'status: open'
test "reopen: rejects mismatched state" _expect_reopen_failure 1 'Ticket is not closed' 0005
printf 'invalid\n' > .coderail/tickets/close/0006-invalid.md
test "reopen: rejects invalid front matter" _expect_reopen_failure 1 'Failed to read ticket' 0006
printf 'preserve\n' > .coderail/tickets/~0005-mismatch.md.lock
test "reopen: rejects locked ticket" _expect_reopen_failure 1 'Failed to lock ticket' 0005
test_expect "reopen: preserves existing lock" 'preserve' cat .coderail/tickets/~0005-mismatch.md.lock
rm .coderail/tickets/~0005-mismatch.md.lock

_write_test_ticket .coderail/tickets/close/0007-same.md 'status: closed'
_write_test_ticket .coderail/tickets/close/0008-same.md 'status: closed'
test "reopen: rejects ambiguous ticket" _expect_reopen_failure 1 'Multiple occurrences found' same
test "reopen: rejects ambiguous dependency" _expect_reopen_failure 1 'Failed to resolve dependency' -d same 0007
test "reopen: missing ticket" _expect_reopen_failure 1 'Failed to resolve ticket' missing
test "reopen: missing argument" _expect_reopen_failure 2 'Required ticket'
test "reopen: multiple tickets" _expect_reopen_failure 2 'Multiple tickets' 0001 0002
test "reopen: extra argument after separator" _expect_reopen_failure 2 'Multiple tickets' 0001 -- 0002
for option in -d --depends-on --depends-on=; do
    test "reopen: missing option value $option" _expect_reopen_failure 2 'Missing argument' 0001 "$option"
done
test "reopen: unknown option" _expect_reopen_failure 2 'Unknown option' --unknown
test "reopen: invalid help" _expect_reopen_failure 2 'does not take an argument' --help=value
test "reopen: help" _run_ticket_reopen --help

_write_test_ticket .coderail/tickets/close/0020-failure.md 'status: closed'
cp .coderail/tickets/close/0020-failure.md "$test_dir/original"
REOPEN_FAIL_WRITE=1
export REOPEN_FAIL_WRITE
test "reopen: write failure" _expect_reopen_failure 1 'Failed to write open ticket' 0020
unset REOPEN_FAIL_WRITE
test "reopen: write failure preserves source" cmp "$test_dir/original" .coderail/tickets/close/0020-failure.md
test "reopen: write failure leaves no destination" test ! -e .coderail/tickets/open/0020-failure.md
REOPEN_FAIL_REMOVE=1
export REOPEN_FAIL_REMOVE
test "reopen: removal failure" _expect_reopen_failure 1 'Failed to remove source ticket' 0020
unset REOPEN_FAIL_REMOVE
test "reopen: removal failure preserves source" cmp "$test_dir/original" .coderail/tickets/close/0020-failure.md
test "reopen: removal failure rolls back destination" test ! -e .coderail/tickets/open/0020-failure.md
ln -s missing .coderail/tickets/open/0020-failure.md
test "reopen: rejects existing destination" _expect_reopen_failure 1 'Ticket already exists' 0020
test "reopen: preserves destination symlink" test -L .coderail/tickets/open/0020-failure.md

test_expect "reopen: releases locks" '' find .coderail/tickets -name '*.lock'
test_expect "reopen: cleans temporary resources" '' find . -name '.cr-tmp-*'

mkdir blocked
cd blocked
mkdir -p .coderail/tickets/close
_write_test_ticket .coderail/tickets/close/0001-blocked.md 'status: closed'
printf 'preserve\n' > .coderail/tickets/open
test "reopen: blocked destination directory" _expect_reopen_failure 1 'Cannot write to' 0001
test "reopen: preserves source on blocked directory" test -f .coderail/tickets/close/0001-blocked.md
test_expect "reopen: preserves blocked destination" 'preserve' cat .coderail/tickets/open
test_expect "reopen: blocked directory releases lock" '' find .coderail/tickets -name '*.lock'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
