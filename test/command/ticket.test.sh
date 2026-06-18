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

. "$SCRIPT_DIR/../suite.sh"

CR_SCRIPT="$ROOT_DIR/bin/cr"
TICKET_SCRIPT="$ROOT_DIR/lib/command/ticket.sh"

run_ticket_status() {
    if sh "$TICKET_SCRIPT" "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

run_cr_ticket_status() {
    if sh "$CR_SCRIPT" ticket "$@" >/dev/null 2>&1; then
        printf 0
    else
        printf '%s' "$?"
    fi
}

help_test() {
    if output=$(sh "$TICKET_SCRIPT" --help 2>&1); then
        status=0
    else
        status=$?
    fi

    case "$output" in
        *"Usage:"*"--help"*"create"*"next"*"open"*"close"*"activate"*"reopen"*) usage=yes ;;
        *) usage=no ;;
    esac

    printf 'status=%s usage=%s' "$status" "$usage"
}

create_test() {
    run_ticket_status create "some ticket title"
}

create_through_cr_test() {
    run_cr_ticket_status create "some ticket title"
}

next_test() {
    run_ticket_status next
}

next_limit_test() {
    run_ticket_status next --limit=5
}

open_test() {
    run_ticket_status open tickets/some-ticket.md
}

close_done_test() {
    run_ticket_status close some-ticket --reason=done
}

close_duplicate_test() {
    run_ticket_status close some-ticket --reason=duplicate
}

close_dismissed_test() {
    run_ticket_status close some-ticket --reason=dismissed
}

close_deferred_test() {
    run_ticket_status close some-ticket --reason=deferred
}

activate_test() {
    run_ticket_status activate some-ticket
}

reopen_test() {
    run_ticket_status reopen some-ticket
}

no_args_test() {
    run_ticket_status
}

help_value_test() {
    run_ticket_status --help=true
}

help_with_command_test() {
    run_ticket_status --help next
}

create_missing_title_test() {
    run_ticket_status create
}

create_extra_argument_test() {
    run_ticket_status create one two
}

create_option_test() {
    run_ticket_status create --help
}

next_limit_missing_value_test() {
    run_ticket_status next --limit
}

next_limit_empty_value_test() {
    run_ticket_status next --limit=
}

next_limit_non_number_test() {
    run_ticket_status next --limit=many
}

next_extra_argument_test() {
    run_ticket_status next --limit=5 extra
}

open_missing_reference_test() {
    run_ticket_status open
}

open_extra_argument_test() {
    run_ticket_status open one two
}

close_missing_reference_test() {
    run_ticket_status close
}

close_missing_reason_test() {
    run_ticket_status close some-ticket
}

close_reason_space_test() {
    run_ticket_status close some-ticket --reason done
}

close_reason_empty_test() {
    run_ticket_status close some-ticket --reason=
}

close_reason_unsupported_test() {
    run_ticket_status close some-ticket --reason=wontfix
}

close_reason_before_reference_test() {
    run_ticket_status close --reason=done some-ticket
}

activate_missing_reference_test() {
    run_ticket_status activate
}

reopen_extra_argument_test() {
    run_ticket_status reopen one two
}

unknown_option_test() {
    run_ticket_status --unknown
}

unknown_command_test() {
    run_ticket_status list
}

run_test "show help message" "status=0 usage=yes" help_test
run_test "allow create with title" "0" create_test
run_test "allow create with title through cr" "0" create_through_cr_test
run_test "allow next" "0" next_test
run_test "allow next with limit" "0" next_limit_test
run_test "allow open reference" "0" open_test
run_test "allow close with done reason" "0" close_done_test
run_test "allow close with duplicate reason" "0" close_duplicate_test
run_test "allow close with dismissed reason" "0" close_dismissed_test
run_test "allow close with deferred reason" "0" close_deferred_test
run_test "allow activate reference" "0" activate_test
run_test "allow reopen reference" "0" reopen_test
run_test "fail when command is missing" "1" no_args_test
run_test "fail when help has a value" "1" help_value_test
run_test "fail when help is combined with command" "1" help_with_command_test
run_test "fail when create title is missing" "1" create_missing_title_test
run_test "fail when create has extra argument" "1" create_extra_argument_test
run_test "fail when create title is an option" "1" create_option_test
run_test "fail when next limit value is missing" "1" next_limit_missing_value_test
run_test "fail when next limit value is empty" "1" next_limit_empty_value_test
run_test "fail when next limit value is not a number" "1" next_limit_non_number_test
run_test "fail when next has extra argument" "1" next_extra_argument_test
run_test "fail when open reference is missing" "1" open_missing_reference_test
run_test "fail when open has extra argument" "1" open_extra_argument_test
run_test "fail when close reference is missing" "1" close_missing_reference_test
run_test "fail when close reason is missing" "1" close_missing_reason_test
run_test "fail when close reason uses space form" "1" close_reason_space_test
run_test "fail when close reason value is empty" "1" close_reason_empty_test
run_test "fail when close reason is unsupported" "1" close_reason_unsupported_test
run_test "fail when close reason is before reference" "1" close_reason_before_reference_test
run_test "fail when activate reference is missing" "1" activate_missing_reference_test
run_test "fail when reopen has extra argument" "1" reopen_extra_argument_test
run_test "fail on unknown option" "1" unknown_option_test
run_test "fail on unknown command" "1" unknown_command_test

test_exit
