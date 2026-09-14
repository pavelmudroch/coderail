#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_ticket_activate()
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

        if [ "${ACTIVATE_FAIL_WRITE:-0}" -eq 1 ]; then
            fs_write()
{ cat > /dev/null; return 1; }
        fi
        if [ "${ACTIVATE_FAIL_REMOVE:-0}" -eq 1 ]; then
            rm()
            {
                [ "${2-}" != ".coderail/tickets/open/0020-failure.md" ] || return 1
                command rm "$@"
            }
        fi

        . "$_CR_INSTALL_DIR/lib/commands/ticket.sh"
        execute_command activate "$@"
    ' ticket-activate-test "$PROJECT_ROOT" "$@"
}

_write_test_ticket()
{
    fixture_path="$1"
    shift
    printf '%s\n' '---' "$@" '---' > "$fixture_path"
}

_expect_activate_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_ticket_activate "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        [ -n "$(sed -n "/$expected_message/p" "$test_dir/stderr")" ]
}

print_tests_header "Ticket Activate Command Tests"

test "activate: missing ticket" _expect_activate_failure 1 'Failed to resolve ticket' missing
mkdir -p .coderail/tickets/open .coderail/tickets/close
_write_test_ticket .coderail/tickets/open/0001-first.md 'title: First' 'status: open' 'reason: duplicate' 'duplicate-of: 9999' 'depends-on:' 'custom: preserved'
printf '\n# Body\n\nPreserve this.\n\n' >> .coderail/tickets/open/0001-first.md
sed -e 's/status: open/status: active/' -e '/^reason:/d' -e '/^duplicate-of:/d' .coderail/tickets/open/0001-first.md > "$test_dir/expected"
printf 'reason: body text\nduplicate-of: body text\n' >> .coderail/tickets/open/0001-first.md
printf 'reason: body text\nduplicate-of: body text\n' >> "$test_dir/expected"
test_expect "activate: resolves ID and creates active directory" '.coderail/tickets/active/0001-first.md' \
    _run_ticket_activate 0001
test "activate: removes closure fields and preserves other metadata and body" cmp "$test_dir/expected" .coderail/tickets/active/0001-first.md
test "activate: removes open file" test ! -e .coderail/tickets/open/0001-first.md
test_expect "activate: releases lock" '' find .coderail/tickets -name '*.lock'
test "activate: rejects already active ticket" _expect_activate_failure 1 'Ticket is not open' 0001

_write_test_ticket .coderail/tickets/close/0010-done.md 'status: closed' 'reason: done'
_write_test_ticket .coderail/tickets/close/0011-duplicate.md 'status: closed' 'reason: duplicate' 'duplicate-of: 0010'
_write_test_ticket .coderail/tickets/open/0002-dependent.md 'status: open' 'depends-on: 0010, 0011'
test_expect "activate: resolves title slug and satisfied dependencies" '.coderail/tickets/active/0002-dependent.md' \
    _run_ticket_activate dependent
_write_test_ticket .coderail/tickets/open/0003-third.md 'status: open'
test_expect "activate: resolves full slug after --" '.coderail/tickets/active/0003-third.md' \
    _run_ticket_activate -- 0003-third

test "activate: rejects closed ticket" _expect_activate_failure 1 'Ticket is not open' 0010
_write_test_ticket .coderail/tickets/open/0004-invalid.md 'malformed'
test "activate: rejects invalid frontmatter" _expect_activate_failure 1 'Failed to read ticket' 0004
_write_test_ticket .coderail/tickets/open/0004-invalid.md 'title: Missing status'
test "activate: rejects missing status" _expect_activate_failure 1 'Ticket is not open' 0004
_write_test_ticket .coderail/tickets/open/0004-invalid.md 'status: active'
test "activate: rejects inconsistent status" _expect_activate_failure 1 'Ticket is not open' 0004

_write_test_ticket .coderail/tickets/close/0012-dismissed.md 'status: closed' 'reason: dismissed'
for dependency in 0001 0012 9999; do
    _write_test_ticket .coderail/tickets/open/0005-blocked.md 'status: open' "depends-on: $dependency"
    cp .coderail/tickets/open/0005-blocked.md "$test_dir/original"
    test "activate: dependency $dependency blocks" _expect_activate_failure 1 'dependencies are not satisfied' 0005
    test "activate: blocked ticket preserved" cmp "$test_dir/original" .coderail/tickets/open/0005-blocked.md
done
test "activate: blocked ticket has no active copy" test ! -e .coderail/tickets/active/0005-blocked.md

_write_test_ticket .coderail/tickets/open/0006-locked.md 'status: open'
printf 'Preserve lock.\n' > .coderail/tickets/~0006-locked.md.lock
test "activate: rejects locked ticket" _expect_activate_failure 1 'Failed to lock ticket' 0006
test_expect "activate: preserves existing lock" 'Preserve lock.' cat .coderail/tickets/~0006-locked.md.lock
rm .coderail/tickets/~0006-locked.md.lock

_write_test_ticket .coderail/tickets/open/0007-collision.md 'status: open'
mkdir .coderail/tickets/active/0007-collision.md
test "activate: rejects existing destination directory" _expect_activate_failure 1 'Ticket already exists' 0007
test "activate: preserves destination directory" test -d .coderail/tickets/active/0007-collision.md
rmdir .coderail/tickets/active/0007-collision.md
ln -s missing .coderail/tickets/active/0007-collision.md
test "activate: rejects dangling destination symlink" _expect_activate_failure 1 'Ticket already exists' 0007

_write_test_ticket .coderail/tickets/open/0008-same.md 'status: open'
_write_test_ticket .coderail/tickets/open/0009-same.md 'status: open'
test "activate: rejects ambiguous slug" _expect_activate_failure 1 'Multiple occurrences found' same
test "activate: missing argument" _expect_activate_failure 2 'Required ticket argument'
test "activate: multiple arguments" _expect_activate_failure 2 'Multiple tickets provided' 0008 0009
test "activate: extra argument after --" _expect_activate_failure 2 'Multiple tickets provided' 0008 -- 0009
test "activate: unknown option" _expect_activate_failure 2 'Unknown option' --unknown
test "activate: invalid help option" _expect_activate_failure 2 'does not take an argument' --help=value
test "activate: help succeeds" _run_ticket_activate --help

_write_test_ticket .coderail/tickets/open/0020-failure.md 'status: open'
cp .coderail/tickets/open/0020-failure.md "$test_dir/original"
ACTIVATE_FAIL_WRITE=1
export ACTIVATE_FAIL_WRITE
test "activate: write error fails" _expect_activate_failure 1 'Failed to write active ticket' 0020
unset ACTIVATE_FAIL_WRITE
test "activate: write error preserves original" cmp "$test_dir/original" .coderail/tickets/open/0020-failure.md
test "activate: write error leaves no active copy" test ! -e .coderail/tickets/active/0020-failure.md
ACTIVATE_FAIL_REMOVE=1
export ACTIVATE_FAIL_REMOVE
test "activate: removal error fails" _expect_activate_failure 1 'Failed to remove open ticket' 0020
unset ACTIVATE_FAIL_REMOVE
test "activate: removal error preserves original" cmp "$test_dir/original" .coderail/tickets/open/0020-failure.md
test "activate: removal error rolls back active copy" test ! -e .coderail/tickets/active/0020-failure.md

test_expect "activate: failure paths release locks" '' find .coderail/tickets -name '*.lock'
test_expect "activate: temporary resources cleaned up" '' find . -name '.cr-tmp-*'

mkdir blocked
cd blocked
mkdir -p .coderail/tickets/open
_write_test_ticket .coderail/tickets/open/0001-blocked.md 'status: open'
cp .coderail/tickets/open/0001-blocked.md "$test_dir/original"
printf 'Preserve destination.\n' > .coderail/tickets/active
test "activate: blocked active directory fails" _expect_activate_failure 1 'Cannot write to' 0001
test "activate: write failure preserves source" cmp "$test_dir/original" .coderail/tickets/open/0001-blocked.md
test_expect "activate: write failure preserves destination" 'Preserve destination.' cat .coderail/tickets/active
test_expect "activate: write failure releases lock" '' find .coderail/tickets -name '*.lock'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
