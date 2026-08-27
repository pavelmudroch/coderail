#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

PROJECT_ROOT=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/text.sh"

_assert_slugify() {
    input=$1
    expected=$2
    actual=$(slugify "$input")

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

print_tests_header "Text Utils Tests"

test "slugify basic words" _assert_slugify "Hello World" "hello-world"
test "slugify with special characters" _assert_slugify "Hello, World!" "hello-world"
test "slugify with multiple spaces" _assert_slugify "Hello   World" "hello-world"
test "slugify with leading and trailing spaces" _assert_slugify "  Hello World  " "hello-world"
test "slugify with mixed case" _assert_slugify "Hello WoRLD" "hello-world"
test "slugify with underscores" _assert_slugify "Hello_World" "hello-world"
test "slugify with multiple hyphens" _assert_slugify "----Hello---World----" "hello-world"
test "slugify complex string" _assert_slugify "@#Hello, World!.. This is a complex< string.!?" "hello-world-this-is-a-complex-string"

print_tests_summary

if some_tests_failed; then
    exit 1
fi