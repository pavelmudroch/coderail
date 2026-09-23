#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/log.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_prepare_log()
{
    log_level=1
    log_color=0
    log_interactive=1
    log_in_progress=0
    log_in_spinner=0
    log_spinner_pid=-1
    reinit_log
}

print_tests_header "Log Utils Tests"

_test_cleanup_stops_subshell_spinner()
{
    spinner_test_dir=$(mktemp -d "$test_dir/spinner.XXXXXX")
    _CR_TEMP_SPINNER_PID_FILE="$spinner_test_dir/spinner-pid"
    : > "$_CR_TEMP_SPINNER_PID_FILE"
    _prepare_log
    log_interactive=1

    (
        spinner "Testing"
    ) 2>/dev/null

    spinner_pid=$(cat "$_CR_TEMP_SPINNER_PID_FILE")
    _log_cleanup

    if [ -e "$_CR_TEMP_SPINNER_PID_FILE" ] || kill -0 "$spinner_pid" 2>/dev/null; then
        rm -rf "$spinner_test_dir"
        return 1
    fi

    rm -rf "$spinner_test_dir"
}

_write_confirm_script()
{
    confirm_interactive=$1

    printf '%s\n' \
        '#!/usr/bin/env sh' \
        'set -eu' \
        'log_level=1' \
        'log_color=0' \
        'log_interactive=1' \
        '. "$1/lib/utils/log.sh"' \
        'reinit_log' \
        "log_interactive=$confirm_interactive" \
        'log_confirm "Continue?"' > "$test_dir/confirm.sh"
}

_run_terminal_confirm()
{
    confirm_interactive=$1
    expected_status=$2
    shift 2
    _write_confirm_script "$confirm_interactive"

    confirm_status=0
    printf '%s\n' "$@" | script -q -e -c "sh '$test_dir/confirm.sh' '$PROJECT_ROOT'" /dev/null \
        > "$test_dir/confirm.stdout" 2> "$test_dir/confirm.stderr" || confirm_status=$?
    [ "$confirm_status" -eq "$expected_status" ]
}

_test_confirm_yes()
{
    _run_terminal_confirm 1 0 ' YeS '
}

_test_confirm_no()
{
    _run_terminal_confirm 1 1 ' no '
}

_test_confirm_empty_defaults_to_no()
{
    _run_terminal_confirm 1 1 ''
}

_test_confirm_invalid_reprompts()
{
    _run_terminal_confirm 1 0 'maybe' 'yes' || return 1
    grep -Fq 'Please answer yes or no.' "$test_dir/confirm.stdout"
}

_test_confirm_noninteractive()
{
    _run_terminal_confirm 0 2 'yes' || return 1
    grep -Fq 'Confirmation input is unavailable' "$test_dir/confirm.stdout"
}

_test_confirm_redirected_stdin()
{
    _prepare_log
    confirm_status=0
    printf '%s\n' yes | log_confirm "Continue?" > "$test_dir/stdout" 2> "$test_dir/stderr" || confirm_status=$?

    [ "$confirm_status" -eq 2 ] && [ ! -s "$test_dir/stdout" ] && \
        grep -Fq 'Continue? [y/N]' "$test_dir/stderr" && \
        grep -Fq 'Confirmation input is unavailable' "$test_dir/stderr"
}

_test_confirm_eof()
{
    _write_confirm_script 1
    confirm_status=0
    : | script -q -e -c "sh '$test_dir/confirm.sh' '$PROJECT_ROOT'" /dev/null \
        > "$test_dir/confirm.stdout" 2> "$test_dir/confirm.stderr" || confirm_status=$?

    [ "$confirm_status" -eq 2 ] && \
        grep -Fq 'Failed to read confirmation input' "$test_dir/confirm.stdout"
}

test "cleanup stops spinner started in a subshell" _test_cleanup_stops_subshell_spinner
test "confirm: accepts Yes from a terminal" _test_confirm_yes
test "confirm: accepts No from a terminal" _test_confirm_no
test "confirm: defaults empty terminal response to No" _test_confirm_empty_defaults_to_no
test "confirm: reprompts invalid terminal response" _test_confirm_invalid_reprompts
test "confirm: rejects terminal input when noninteractive" _test_confirm_noninteractive
test "confirm: rejects redirected stdin and writes stderr" _test_confirm_redirected_stdin
test "confirm: reports terminal EOF" _test_confirm_eof

print_tests_summary

if some_tests_failed; then
    exit 1
fi
