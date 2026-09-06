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
. "$PROJECT_ROOT/lib/utils/md.sh"

print_tests_header "Text Utils Tests"

test_expect "slugify basic words" "hello-world" slugify "Hello World"
test_expect "slugify with special characters" "hello-world" slugify "Hello, World!"
test_expect "slugify with multiple spaces" "hello-world" slugify "Hello   World"
test_expect "slugify with leading and trailing spaces" "hello-world" slugify "  Hello World  "
test_expect "slugify with mixed case" "hello-world" slugify "Hello WoRLD"
test_expect "slugify with underscores" "hello-world" slugify "Hello_World"
test_expect "slugify with multiple hyphens" "hello-world" slugify "----Hello---World----"
test_expect "slugify complex string" "hello-world-this-is-a-complex-string" slugify "@#Hello, World!.. This is a complex< string.!?"

print_tests_summary

if some_tests_failed; then
    exit 1
fi
