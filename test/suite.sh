#!/usr/bin/env sh

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

suite_test_counter=0
suite_line_width=80
suite_status_width=8

suite_passed_test_counter=0
suite_failed_test_counter=0
suite_some_tests_failed=false

suite_green=$(printf '\033[32m')
suite_red=$(printf '\033[31m')
suite_grey=$(printf '\033[90m')
suite_summary_style=$(printf '\033[1;38;5;232;48;5;250m')
suite_summary_filename_style=$(printf '\033[38;5;240;48;5;250m')
suite_reset=$(printf '\033[0m')

suite_spaces() {
    count=$1

    while [ "$count" -gt 0 ]; do
        printf ' '
        count=$((count - 1))
    done
}

suite_status_line() {
    message=$1
    status_text=$2
    status_color=$3
    message_width=$((suite_line_width - suite_status_width))
    line="$suite_test_counter. $message..."

    if [ "${#line}" -gt "$message_width" ]; then
        line=$(printf '%.*s' "$message_width" "$line")
    fi

    line_padding=$((message_width - ${#line}))
    status_padding=$((suite_status_width - ${#status_text}))

    printf '%s' "$line"
    suite_spaces "$line_padding"
    suite_spaces "$status_padding"
    printf '%s%s%s\n' "$status_color" "$status_text" "$suite_reset"
}

suite_print_stderr() {
    stderr_output=$1

    if [ -z "$stderr_output" ]; then
        printf '%s > %s\n' "$suite_grey" "$suite_reset"
        return
    fi

    printf '%s\n' "$stderr_output" | while IFS= read -r line || [ -n "$line" ]; do
        printf '%s > %s%s\n' "$suite_grey" "$line" "$suite_reset"
    done
}

test() {
    message=$1
    test_function=$2
    shift 2

    suite_test_counter=$((suite_test_counter + 1))

    if ! command -v "$test_function" >/dev/null 2>&1; then
        suite_status_line "$message" '[ FAIL ]' "$suite_red"
        suite_print_stderr "test function not found: $test_function"
        suite_failed_test_counter=$((suite_failed_test_counter + 1))
        suite_some_tests_failed=true
        return
    fi

    if stderr_output=$("$test_function" "$@" 2>&1 >/dev/null); then
        suite_status_line "$message" '[ OK ]' "$suite_green"
        suite_passed_test_counter=$((suite_passed_test_counter + 1))
        return
    else
        status=$?
    fi

    suite_status_line "$message" '[ FAIL ]' "$suite_red"
    suite_print_stderr "$stderr_output"
    suite_failed_test_counter=$((suite_failed_test_counter + 1))
    suite_some_tests_failed=true
}

print_tests_header() {
    title=" $1 "
    test_filename="(${0##*/})"
    title_width=$((suite_line_width - ${#test_filename}))

    if [ "$title_width" -lt 0 ]; then
        title_width=0
    fi

    if [ "${#title}" -gt "$title_width" ]; then
        title=$(printf '%.*s' "$title_width" "$title")
    fi

    filename_width=$((suite_line_width - ${#title}))

    if [ "${#test_filename}" -gt "$filename_width" ]; then
        test_filename=$(printf '(%.*s)' "$((filename_width - 2))" "$test_filename")
    fi

    line_padding=$((suite_line_width - ${#title} - ${#test_filename}))

    printf '%s%s%s%s' "$suite_summary_style" "$title" "$suite_summary_filename_style" "$test_filename"
    suite_spaces "$line_padding"
    printf '\033[K%s\n' "$suite_reset"
}

print_tests_summary() {
    line=" Total: $suite_test_counter  Passed: $suite_passed_test_counter  Failed: $suite_failed_test_counter"

    if [ "${#line}" -gt "$suite_line_width" ]; then
        line=$(printf '%.*s' "$suite_line_width" "$line")
    fi

    line_padding=$((suite_line_width - ${#line}))

    printf '%s%s' "$suite_summary_style" "$line"
    suite_spaces "$line_padding"
    printf '\033[K%s\n' "$suite_reset"
    suite_test_counter=0
    suite_passed_test_counter=0
    suite_failed_test_counter=0
}

some_tests_failed() {
    [ "$suite_some_tests_failed" = true ]
}
