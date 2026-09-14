#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_ticket_create()
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

        . "$_CR_INSTALL_DIR/lib/commands/ticket.sh"
        execute_command create "$@"
    ' ticket-create-test "$PROJECT_ROOT" "$@"
}

print_tests_header "Ticket Create Command Tests"

test_expect "create: first ticket path" '.coderail/tickets/open/0001-first-ticket.md' \
    _run_ticket_create 'First Ticket!'
test_expect "create: initial front matter" "$(printf '%s\n' '---' 'title: First Ticket!' 'status: open' 'depends-on: ' '---')" cat .coderail/tickets/open/0001-first-ticket.md

test_expect "create: repeated title gets a new ID" '.coderail/tickets/open/0002-first-ticket.md' \
    _run_ticket_create 'First Ticket!'
mkdir -p .coderail/tickets/active .coderail/tickets/close
printf '%s\n' '---' 'status: active' '---' > .coderail/tickets/active/0008-active.md
printf '%s\n' '---' 'status: closed' '---' > .coderail/tickets/close/0009-done.md

test_expect "create: IDs span all states and dependencies resolve" '.coderail/tickets/open/0010-dependent.md' \
    _run_ticket_create -d 0001 --depends-on active --depends-on=0009-done Dependent
test_expect "create: stores resolved dependency IDs" '0001, 0008, 0009' \
    sh -c '. "$1/lib/utils/md.sh"; md_frontmatter_get depends-on < .coderail/tickets/open/0010-dependent.md' sh "$PROJECT_ROOT"

test_expect "create: -- allows a leading hyphen" '.coderail/tickets/open/0011-option-title.md' \
    _run_ticket_create -- --option-title

_expect_create_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_ticket_create "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        [ -n "$(sed -n "/$expected_message/p" "$test_dir/stderr")" ]
}

test "create: missing dependency" _expect_create_failure 1 'Failed to resolve dependency' -d missing Missing
test "create: ambiguous dependency" _expect_create_failure 1 'Multiple occurrences found' -d first-ticket Ambiguous
for option in -d --depends-on --depends-on=; do
    test "create: missing value for $option" _expect_create_failure 2 'Missing argument' "$option"
done
test "create: missing title" _expect_create_failure 2 'Required ticket title'
test "create: multiple titles" _expect_create_failure 2 'Multiple ticket titles' One Two
test "create: extra title after --" _expect_create_failure 2 'Multiple ticket titles' One -- Two
test "create: empty slug" _expect_create_failure 2 'Ticket title must contain' '!!!'
test_expect "create: failures leave ticket count unchanged" 4 \
    sh -c 'find .coderail/tickets/open -type f | wc -l | tr -d " "'

printf '%s\n' '---' 'status: closed' '---' > .coderail/tickets/close/9999-last.md
test_expect "create: ID expands beyond four digits" '.coderail/tickets/open/10000-expanded.md' \
    _run_ticket_create Expanded

test_expect "create: temporary resources cleaned up" '' find . -name '.cr-tmp-*'
mkdir blocked
cd blocked
mkdir -p .coderail/tickets
printf 'Preserve me.\n' > .coderail/tickets/open
test "create: blocked destination fails" _expect_create_failure 1 'Cannot write to' Blocked
test_expect "create: blocked destination preserved" 'Preserve me.' cat .coderail/tickets/open

print_tests_summary

if some_tests_failed; then
    exit 1
fi
